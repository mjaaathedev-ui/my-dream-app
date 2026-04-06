import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

async function buildReadOnlyContext(supabaseAdmin: any, userId: string): Promise<string> {
  const parts: string[] = [];

  // Profile
  const { data: profile } = await supabaseAdmin
    .from("users_profile")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (profile) {
    parts.push(`=== STUDENT PROFILE ===`);
    parts.push(`Name: ${profile.full_name}`);
    parts.push(`Institution: ${profile.institution || "N/A"}`);
    parts.push(`Degree: ${profile.degree || "N/A"}, ${profile.year_of_study || "N/A"}`);
    parts.push(`Career goal: ${profile.career_goal || "N/A"}`);
    parts.push(`Target average: ${profile.target_average || 70}%`);
    parts.push(`Daily study target: ${profile.daily_study_target_hours || 4}h`);
    if (profile.has_funding_condition && profile.funding_condition) {
      parts.push(`Funding condition: ${profile.funding_condition}`);
    }
  }

  // Modules & grades
  const { data: modules } = await supabaseAdmin
    .from("modules")
    .select("*")
    .eq("user_id", userId)
    .eq("archived", false);

  const { data: assessments } = await supabaseAdmin
    .from("assessments")
    .select("*")
    .eq("user_id", userId);

  const mods = modules || [];
  const allAssessments = assessments || [];

  if (mods.length > 0) {
    parts.push(`\n=== MODULES & GRADES ===`);
    for (const m of mods) {
      const mAssessments = allAssessments.filter((a: any) => a.module_id === m.id);
      const submitted = mAssessments.filter((a: any) => a.submitted && a.mark_achieved !== null);
      let avg = "No grades yet";
      if (submitted.length > 0) {
        const totalWeight = submitted.reduce((s: number, a: any) => s + a.weight_percent, 0);
        if (totalWeight > 0) {
          const weightedAvg = submitted.reduce(
            (s: number, a: any) => s + ((a.mark_achieved / (a.max_mark || 100)) * 100 * a.weight_percent), 0
          ) / totalWeight;
          avg = `${Math.round(weightedAvg)}%`;
        }
      }
      parts.push(`${m.name} (${m.code}): ${avg}`);
    }
  }

  // Upcoming assessments
  const now = new Date();
  const upcoming = allAssessments
    .filter((a: any) => a.due_date && !a.submitted && new Date(a.due_date) > now)
    .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
    .slice(0, 5);

  if (upcoming.length > 0) {
    parts.push(`\n=== UPCOMING ASSESSMENTS ===`);
    for (const a of upcoming) {
      const mod = mods.find((m: any) => m.id === a.module_id);
      const days = Math.ceil((new Date(a.due_date).getTime() - now.getTime()) / 86400000);
      parts.push(`- ${a.name} (${mod?.name || "?"}) — ${a.type}, ${a.weight_percent}%, in ${days}d`);
    }
  }

  // Today's study
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const { data: todaySessions } = await supabaseAdmin
    .from("study_sessions")
    .select("duration_minutes")
    .eq("user_id", userId)
    .gte("started_at", todayStart.toISOString());

  const todayMinutes = (todaySessions || []).reduce((s: number, se: any) => s + (Number(se.duration_minutes) || 0), 0);
  parts.push(`\n=== TODAY ===`);
  parts.push(`Study today: ${(todayMinutes / 60).toFixed(1)}h / ${profile?.daily_study_target_hours || 4}h target`);

  // Active tasks
  const { data: tasks } = await supabaseAdmin
    .from("tasks")
    .select("title, status, module_id, due_date")
    .eq("user_id", userId)
    .neq("status", "done")
    .limit(10);

  if (tasks && tasks.length > 0) {
    parts.push(`\n=== ACTIVE TASKS ===`);
    for (const t of tasks) {
      const mod = mods.find((m: any) => m.id === t.module_id);
      parts.push(`- ${t.title} [${mod?.name || "?"}] — ${t.status}`);
    }
  }

  // Goals
  const { data: goals } = await supabaseAdmin
    .from("goals")
    .select("title, type, achieved, target_value, current_value")
    .eq("user_id", userId)
    .eq("achieved", false)
    .limit(5);

  if (goals && goals.length > 0) {
    parts.push(`\n=== ACTIVE GOALS ===`);
    for (const g of goals) {
      parts.push(`- ${g.title} (${g.type})${g.target_value ? `: ${g.current_value || 0}/${g.target_value}` : ""}`);
    }
  }

  return parts.join("\n");
}

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

    // Twilio sends form-encoded webhooks
    const contentType = req.headers.get("content-type") || "";
    let fromNumber = "";
    let body = "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      fromNumber = formData.get("From")?.toString() || "";
      body = formData.get("Body")?.toString() || "";
    } else {
      const json = await req.json();
      fromNumber = json.From || "";
      body = json.Body || "";
    }

    if (!fromNumber || !body) {
      // Return TwiML empty response
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
      );
    }

    // Strip "whatsapp:" prefix to match DB
    const cleanNumber = fromNumber.replace("whatsapp:", "").trim();

    // Find user by WhatsApp number
    const { data: profiles } = await supabaseAdmin
      .from("users_profile")
      .select("user_id, full_name, whatsapp_number, whatsapp_enabled")
      .eq("whatsapp_enabled", true);

    const userProfile = (profiles || []).find((p: any) => {
      const dbNum = (p.whatsapp_number || "").replace(/\s/g, "");
      return dbNum === cleanNumber || dbNum === `+${cleanNumber}` || `+${dbNum}` === cleanNumber;
    });

    let replyText: string;

    if (!userProfile) {
      replyText = "Sorry, I couldn't find an account linked to this number. Please make sure your WhatsApp number is saved in your settings with the correct country code.";
    } else {
      // Build read-only context
      const context = await buildReadOnlyContext(supabaseAdmin, userProfile.user_id);

      // Get recent WhatsApp conversation history (last 10 messages)
      const { data: recentLogs } = await supabaseAdmin
        .from("notifications_log")
        .select("type, title, message, sent_at")
        .eq("user_id", userProfile.user_id)
        .in("type", ["whatsapp_checkin", "whatsapp_reply", "whatsapp_incoming"])
        .order("sent_at", { ascending: false })
        .limit(10);

      const conversationHistory = (recentLogs || []).reverse().map((l: any) => {
        if (l.type === "whatsapp_incoming") {
          return { role: "user", content: l.message };
        }
        return { role: "assistant", content: l.message };
      });

      // Call AI (read-only, no tools)
      const LOVABLE_AI_URL = "https://ai-gateway.lovable.dev/chat/completions";
      const firstName = (userProfile.full_name || "").split(" ")[0] || "there";

      const systemPrompt = `You are a friendly, motivating study advisor chatting via WhatsApp. Your name is StudyBuddy.

CRITICAL RULES:
- You are READ-ONLY. You CANNOT create, edit, delete, or modify any data.
- If the user asks you to add a task, change a grade, update their timetable, or modify anything, politely explain that changes must be made in the app.
- You CAN answer questions about their grades, schedule, upcoming assessments, study progress, tasks, and goals.
- You CAN give study advice, motivation, and recommendations based on their data.
- Keep responses concise (under 300 words) — this is WhatsApp, not an essay.
- Use emoji sparingly but warmly.
- Address the student as "${firstName}".

Here is the student's current academic data:
${context}`;

      const messages = [
        { role: "system", content: systemPrompt },
        ...conversationHistory,
        { role: "user", content: body },
      ];

      const aiRes = await fetch(LOVABLE_AI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
        }),
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text();
        console.error("AI error:", errText);
        replyText = `Hey ${firstName}! I'm having a bit of trouble right now 🤔 Try again in a minute, or check the app for your latest info.`;
      } else {
        const aiData = await aiRes.json();
        replyText = aiData.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response right now.";
      }

      // Log incoming message
      await supabaseAdmin.from("notifications_log").insert({
        user_id: userProfile.user_id,
        type: "whatsapp_incoming",
        title: "WhatsApp Message",
        message: body,
      });

      // Log outgoing reply
      await supabaseAdmin.from("notifications_log").insert({
        user_id: userProfile.user_id,
        type: "whatsapp_reply",
        title: "WhatsApp AI Reply",
        message: replyText,
      });
    }

    // Send reply via Twilio
    let fromNum = TWILIO_WHATSAPP_FROM;
    if (!fromNum.startsWith("whatsapp:")) fromNum = `whatsapp:${fromNum}`;

    const twilioRes = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TWILIO_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: fromNumber,
        From: fromNum,
        Body: replyText,
      }),
    });

    const twilioData = await twilioRes.json();
    if (!twilioRes.ok) {
      console.error("Twilio send error:", twilioData);
    }

    // Return TwiML empty (we already sent the reply via API)
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
    );
  } catch (err: any) {
    console.error("WhatsApp webhook error:", err);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
    );
  }
});
