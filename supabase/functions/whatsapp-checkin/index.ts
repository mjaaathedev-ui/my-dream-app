import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
    if (!TWILIO_API_KEY) throw new Error("TWILIO_API_KEY not configured");

    const TWILIO_WHATSAPP_FROM = Deno.env.get("TWILIO_WHATSAPP_FROM");
    if (!TWILIO_WHATSAPP_FROM) throw new Error("TWILIO_WHATSAPP_FROM not configured");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all users with WhatsApp enabled and a phone number
    const { data: users, error: usersErr } = await supabaseAdmin
      .from("users_profile")
      .select("user_id, full_name, whatsapp_number, whatsapp_enabled, checkin_interval_hours, daily_study_target_hours, target_average")
      .eq("whatsapp_enabled", true)
      .neq("whatsapp_number", "")
      .not("whatsapp_number", "is", null);

    if (usersErr) throw usersErr;
    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ message: "No users to notify" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const results: { user_id: string; status: string; detail?: string }[] = [];

    for (const user of users) {
      try {
        // Check last notification sent to this user
        const { data: lastNotif } = await supabaseAdmin
          .from("notifications_log")
          .select("sent_at")
          .eq("user_id", user.user_id)
          .eq("type", "whatsapp_checkin")
          .order("sent_at", { ascending: false })
          .limit(1)
          .single();

        const intervalHours = user.checkin_interval_hours || 6;
        if (lastNotif) {
          const lastSent = new Date(lastNotif.sent_at);
          const hoursSince = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60);
          if (hoursSince < intervalHours) {
            results.push({ user_id: user.user_id, status: "skipped", detail: `Only ${hoursSince.toFixed(1)}h since last, interval is ${intervalHours}h` });
            continue;
          }
        }

        // Get today's study sessions for context
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);

        const { data: todaySessions } = await supabaseAdmin
          .from("study_sessions")
          .select("duration_minutes, module_id")
          .eq("user_id", user.user_id)
          .gte("started_at", todayStart.toISOString());

        const totalMinutesToday = (todaySessions || []).reduce(
          (sum, s) => sum + (Number(s.duration_minutes) || 0), 0
        );
        const totalHoursToday = (totalMinutesToday / 60).toFixed(1);
        const targetHours = user.daily_study_target_hours || 4;

        // Get upcoming assessments
        const nextWeek = new Date(now);
        nextWeek.setDate(nextWeek.getDate() + 7);

        const { data: upcomingAssessments } = await supabaseAdmin
          .from("assessments")
          .select("name, due_date, type")
          .eq("user_id", user.user_id)
          .gte("due_date", now.toISOString())
          .lte("due_date", nextWeek.toISOString())
          .order("due_date", { ascending: true })
          .limit(3);

        // Build message
        const firstName = (user.full_name || "").split(" ")[0] || "there";
        let message = `📚 Hey ${firstName}! Quick check-in:\n\n`;
        message += `⏱ Study today: ${totalHoursToday}h / ${targetHours}h target\n`;

        if (Number(totalHoursToday) >= targetHours) {
          message += `🎉 You've hit your target! Great work!\n`;
        } else {
          const remaining = (targetHours - Number(totalHoursToday)).toFixed(1);
          message += `💪 ${remaining}h to go — you've got this!\n`;
        }

        if (upcomingAssessments && upcomingAssessments.length > 0) {
          message += `\n📅 Coming up:\n`;
          for (const a of upcomingAssessments) {
            const dueDate = new Date(a.due_date!);
            const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            message += `• ${a.name} (${a.type}) — ${daysUntil} day${daysUntil !== 1 ? "s" : ""}\n`;
          }
        }

        message += `\nReply with what you're working on! 🚀`;

        // Format WhatsApp number
        let toNumber = user.whatsapp_number.replace(/\s/g, "");
        if (!toNumber.startsWith("whatsapp:")) {
          toNumber = `whatsapp:${toNumber}`;
        }

        let fromNumber = TWILIO_WHATSAPP_FROM;
        if (!fromNumber.startsWith("whatsapp:")) {
          fromNumber = `whatsapp:${fromNumber}`;
        }

        // Send via Twilio gateway
        const twilioRes = await fetch(`${GATEWAY_URL}/Messages.json`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": TWILIO_API_KEY,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: toNumber,
            From: fromNumber,
            Body: message,
          }),
        });

        const twilioData = await twilioRes.json();

        if (!twilioRes.ok) {
          throw new Error(`Twilio error [${twilioRes.status}]: ${JSON.stringify(twilioData)}`);
        }

        // Log the notification
        await supabaseAdmin.from("notifications_log").insert({
          user_id: user.user_id,
          type: "whatsapp_checkin",
          title: "WhatsApp Check-in",
          message: message,
        });

        results.push({ user_id: user.user_id, status: "sent", detail: twilioData.sid });
      } catch (userErr: any) {
        console.error(`Failed for user ${user.user_id}:`, userErr);
        results.push({ user_id: user.user_id, status: "error", detail: userErr.message });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("WhatsApp checkin error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
