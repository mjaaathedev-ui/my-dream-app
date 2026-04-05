import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOOLS = [
  {
    type: "function",
    function: {
      name: "add_module",
      description: "Add a new academic module/course for the student",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Module name" },
          code: { type: "string", description: "Module code e.g. CS201" },
          credit_weight: { type: "number", description: "Credit weight" },
          color: { type: "string", description: "Hex color e.g. #2563EB" },
          semester: { type: "string", description: "Semester e.g. S1 2026" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_assessment",
      description: "Add an assessment (test, assignment, exam, practical, project) to a module. Use this when parsing course outlines, syllabi, or when a student mentions upcoming assessments.",
      parameters: {
        type: "object",
        properties: {
          module_name: { type: "string", description: "Name of the module to add assessment to" },
          name: { type: "string", description: "Assessment name" },
          type: { type: "string", enum: ["test", "assignment", "exam", "practical", "project"] },
          weight_percent: { type: "number", description: "Weight percentage" },
          due_date: { type: "string", description: "Due date in YYYY-MM-DD format" },
          max_mark: { type: "number", description: "Maximum mark, default 100" },
        },
        required: ["module_name", "name", "type", "weight_percent"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_mark",
      description: "Record a mark/grade for an existing assessment",
      parameters: {
        type: "object",
        properties: {
          module_name: { type: "string", description: "Module name" },
          assessment_name: { type: "string", description: "Assessment name" },
          mark: { type: "number", description: "Mark achieved" },
        },
        required: ["module_name", "assessment_name", "mark"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_goal",
      description: "Create a new goal for the student",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          type: { type: "string", enum: ["semester", "module", "career", "funding"] },
          target_value: { type: "number" },
          deadline: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["title", "type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_timetable_entry",
      description: "Add an entry to the student's weekly timetable",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          type: { type: "string", enum: ["class", "tutorial", "practical", "study", "personal", "assessment"] },
          day_of_week: { type: "number", description: "0=Monday, 1=Tuesday, 2=Wednesday, 3=Thursday, 4=Friday, 5=Saturday, 6=Sunday" },
          start_time: { type: "string", description: "HH:MM 24-hour format" },
          end_time: { type: "string", description: "HH:MM 24-hour format" },
          location: { type: "string" },
          module_name: { type: "string", description: "Optional module name to link" },
        },
        required: ["title", "type", "day_of_week", "start_time", "end_time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_timetable_entry",
      description: "Update an existing timetable entry. Find by title (and optionally day) then update fields.",
      parameters: {
        type: "object",
        properties: {
          current_title: { type: "string", description: "Current title of the entry to update" },
          day_of_week: { type: "number", description: "Day to narrow search: 0=Monday...6=Sunday" },
          new_title: { type: "string" },
          new_type: { type: "string", enum: ["class", "tutorial", "practical", "study", "personal", "assessment"] },
          new_day_of_week: { type: "number", description: "0=Monday...6=Sunday" },
          new_start_time: { type: "string", description: "HH:MM 24-hour" },
          new_end_time: { type: "string", description: "HH:MM 24-hour" },
          new_location: { type: "string" },
          module_name: { type: "string", description: "Module to link" },
        },
        required: ["current_title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_timetable_entry",
      description: "Delete a timetable entry by title (and optionally day to narrow it down)",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Title of the entry to delete" },
          day_of_week: { type: "number", description: "Day to narrow search: 0=Monday...6=Sunday" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_study_session",
      description: "Log a completed study session for the student",
      parameters: {
        type: "object",
        properties: {
          module_name: { type: "string" },
          duration_minutes: { type: "number" },
          topic: { type: "string" },
          energy_level: { type: "number", description: "1-5" },
        },
        required: ["module_name", "duration_minutes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bulk_create_from_document",
      description: "Create multiple modules and assessments at once from a parsed document (course outline, syllabus, study guide). Use this when the student uploads a document and you detect modules and assessments.",
      parameters: {
        type: "object",
        properties: {
          modules: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                code: { type: "string" },
                credit_weight: { type: "number" },
                semester: { type: "string" },
                assessments: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      type: { type: "string", enum: ["test", "assignment", "exam", "practical", "project"] },
                      weight_percent: { type: "number" },
                      due_date: { type: "string", description: "YYYY-MM-DD or null" },
                      max_mark: { type: "number" },
                      mark_achieved: { type: "number", description: "null if not yet submitted" },
                    },
                    required: ["name", "type", "weight_percent"],
                  },
                },
              },
              required: ["name", "assessments"],
            },
          },
        },
        required: ["modules"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_calendar_events",
      description: "Create Google Calendar events for assessments with due dates. Only use if the student has Google Calendar connected.",
      parameters: {
        type: "object",
        properties: {
          events: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "Event title e.g. [CS201] Test 1 (30%)" },
                date: { type: "string", description: "YYYY-MM-DD" },
                description: { type: "string" },
              },
              required: ["title", "date"],
            },
          },
        },
        required: ["events"],
      },
    },
  },
];

const MODULE_COLORS = [
  "#2563EB", "#DC2626", "#16A34A", "#D97706", "#7C3AED",
  "#DB2777", "#0891B2", "#65A30D", "#EA580C", "#4F46E5",
];

async function executeTool(
  supabaseAdmin: any,
  userId: string,
  toolName: string,
  args: any,
  modules: any[]
): Promise<string> {
  const findModule = (name: string) => {
    const lower = name.toLowerCase();
    return modules.find(
      (m: any) =>
        m.name.toLowerCase() === lower ||
        m.code.toLowerCase() === lower ||
        m.name.toLowerCase().includes(lower) ||
        lower.includes(m.name.toLowerCase())
    );
  };

  switch (toolName) {
    case "add_module": {
      const { data, error } = await supabaseAdmin
        .from("modules")
        .insert({
          user_id: userId,
          name: args.name,
          code: args.code || "",
          credit_weight: args.credit_weight || 16,
          color: args.color || MODULE_COLORS[modules.length % MODULE_COLORS.length],
          semester: args.semester || "",
          sort_order: modules.length,
        })
        .select()
        .single();
      if (error) return `Error adding module: ${error.message}`;
      modules.push(data);
      return `✅ Module "${args.name}" added successfully.`;
    }
    case "add_assessment": {
      const mod = findModule(args.module_name);
      if (!mod) return `❌ Module "${args.module_name}" not found. Available: ${modules.map((m: any) => m.name).join(", ")}`;
      const { error } = await supabaseAdmin.from("assessments").insert({
        user_id: userId,
        module_id: mod.id,
        name: args.name,
        type: args.type,
        weight_percent: args.weight_percent,
        due_date: args.due_date || null,
        max_mark: args.max_mark || 100,
      });
      if (error) return `Error: ${error.message}`;
      return `✅ Assessment "${args.name}" (${args.type}, ${args.weight_percent}%) added to ${mod.name}.${args.due_date ? ` Due: ${args.due_date}` : ''}`;
    }
    case "log_mark": {
      const mod = findModule(args.module_name);
      if (!mod) return `❌ Module "${args.module_name}" not found.`;
      const { data: assessments } = await supabaseAdmin
        .from("assessments")
        .select("*")
        .eq("user_id", userId)
        .eq("module_id", mod.id);
      const assessment = (assessments || []).find(
        (a: any) =>
          a.name.toLowerCase().includes(args.assessment_name.toLowerCase()) ||
          args.assessment_name.toLowerCase().includes(a.name.toLowerCase())
      );
      if (!assessment) return `❌ Assessment "${args.assessment_name}" not found in ${mod.name}.`;
      const { error } = await supabaseAdmin
        .from("assessments")
        .update({ mark_achieved: args.mark, submitted: true })
        .eq("id", assessment.id);
      if (error) return `Error: ${error.message}`;
      return `✅ Mark ${args.mark}/${assessment.max_mark} recorded for "${assessment.name}".`;
    }
    case "add_goal": {
      const { error } = await supabaseAdmin.from("goals").insert({
        user_id: userId,
        title: args.title,
        description: args.description || "",
        type: args.type,
        target_value: args.target_value || null,
        deadline: args.deadline || null,
      });
      if (error) return `Error: ${error.message}`;
      return `✅ Goal "${args.title}" created.`;
    }
    case "add_timetable_entry": {
      let moduleId = null;
      if (args.module_name) {
        const mod = findModule(args.module_name);
        if (mod) moduleId = mod.id;
      }
      const { error } = await supabaseAdmin.from("timetable_entries").insert({
        user_id: userId,
        title: args.title,
        type: args.type,
        day_of_week: args.day_of_week,
        start_time: args.start_time,
        end_time: args.end_time,
        location: args.location || "",
        module_id: moduleId,
      });
      if (error) return `Error: ${error.message}`;
      const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
      return `✅ Timetable entry "${args.title}" added on ${dayNames[args.day_of_week]} ${args.start_time}–${args.end_time}.`;
    }
    case "update_timetable_entry": {
      const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
      let query = supabaseAdmin.from("timetable_entries").select("*").eq("user_id", userId).ilike("title", `%${args.current_title}%`);
      if (args.day_of_week !== undefined) query = query.eq("day_of_week", args.day_of_week);
      const { data: entries } = await query;
      if (!entries || entries.length === 0) return `❌ No timetable entry found matching "${args.current_title}".`;
      const entry = entries[0];
      const updates: any = {};
      if (args.new_title) updates.title = args.new_title;
      if (args.new_type) updates.type = args.new_type;
      if (args.new_day_of_week !== undefined) updates.day_of_week = args.new_day_of_week;
      if (args.new_start_time) updates.start_time = args.new_start_time;
      if (args.new_end_time) updates.end_time = args.new_end_time;
      if (args.new_location !== undefined) updates.location = args.new_location;
      if (args.module_name) {
        const mod = findModule(args.module_name);
        if (mod) updates.module_id = mod.id;
      }
      if (Object.keys(updates).length === 0) return `⚠️ No changes specified for "${args.current_title}".`;
      const { error } = await supabaseAdmin.from("timetable_entries").update(updates).eq("id", entry.id);
      if (error) return `Error: ${error.message}`;
      return `✅ Updated "${entry.title}"${updates.day_of_week !== undefined ? ` → ${dayNames[updates.day_of_week]}` : ''}${updates.start_time ? ` ${updates.start_time}–${updates.end_time || entry.end_time}` : ''}.`;
    }
    case "delete_timetable_entry": {
      let query = supabaseAdmin.from("timetable_entries").select("*").eq("user_id", userId).ilike("title", `%${args.title}%`);
      if (args.day_of_week !== undefined) query = query.eq("day_of_week", args.day_of_week);
      const { data: entries } = await query;
      if (!entries || entries.length === 0) return `❌ No timetable entry found matching "${args.title}".`;
      const entry = entries[0];
      const { error } = await supabaseAdmin.from("timetable_entries").delete().eq("id", entry.id);
      if (error) return `Error: ${error.message}`;
      return `✅ Deleted timetable entry "${entry.title}".`;
    }
    case "log_study_session": {
      const mod = findModule(args.module_name);
      if (!mod) return `❌ Module "${args.module_name}" not found.`;
      const now = new Date();
      const started = new Date(now.getTime() - args.duration_minutes * 60000);
      const { error } = await supabaseAdmin.from("study_sessions").insert({
        user_id: userId,
        module_id: mod.id,
        started_at: started.toISOString(),
        ended_at: now.toISOString(),
        duration_minutes: args.duration_minutes,
        topic: args.topic || "",
        energy_level: args.energy_level || 3,
        session_type: "custom",
      });
      if (error) return `Error: ${error.message}`;
      return `✅ Study session (${args.duration_minutes}min) logged for ${mod.name}.`;
    }
    case "bulk_create_from_document": {
      const results: string[] = [];
      for (const modData of args.modules || []) {
        // Check if module exists
        let mod = findModule(modData.name) || (modData.code ? findModule(modData.code) : null);
        
        if (!mod) {
          const { data, error } = await supabaseAdmin.from("modules").insert({
            user_id: userId,
            name: modData.name,
            code: modData.code || "",
            credit_weight: modData.credit_weight || 16,
            color: MODULE_COLORS[modules.length % MODULE_COLORS.length],
            semester: modData.semester || "",
            sort_order: modules.length,
          }).select().single();
          if (error) {
            results.push(`❌ Failed to create module "${modData.name}": ${error.message}`);
            continue;
          }
          mod = data;
          modules.push(data);
          results.push(`✅ Module "${modData.name}" created.`);
        } else {
          results.push(`📝 Module "${modData.name}" already exists.`);
        }

        // Add assessments
        const assessments = modData.assessments || [];
        if (assessments.length > 0) {
          const rows = assessments.map((a: any) => ({
            user_id: userId,
            module_id: mod.id,
            name: a.name,
            type: a.type || "assignment",
            weight_percent: a.weight_percent || 0,
            due_date: a.due_date || null,
            max_mark: a.max_mark || 100,
            mark_achieved: a.mark_achieved ?? null,
            submitted: a.mark_achieved != null,
          }));
          const { error } = await supabaseAdmin.from("assessments").insert(rows);
          if (error) {
            results.push(`  ❌ Failed to add assessments: ${error.message}`);
          } else {
            results.push(`  ✅ ${assessments.length} assessment(s) added to ${modData.name}.`);
          }
        }
      }
      return results.join("\n");
    }
    case "create_calendar_events": {
      // Get user's Google token and calendar preference
      const { data: tokenRow } = await supabaseAdmin
        .from("google_tokens")
        .select("*")
        .eq("user_id", userId)
        .single();
      
      if (!tokenRow) return "⚠️ Google Calendar not connected. Events not created.";

      // Get preferred calendar
      const { data: profileData } = await supabaseAdmin
        .from("users_profile")
        .select("google_calendar_id")
        .eq("user_id", userId)
        .single();
      
      const calendarId = profileData?.google_calendar_id || "primary";

      // Check token expiry and refresh if needed
      let accessToken = tokenRow.access_token;
      if (new Date(tokenRow.expires_at) < new Date()) {
        const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
        const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
        if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
          const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: GOOGLE_CLIENT_ID,
              client_secret: GOOGLE_CLIENT_SECRET,
              refresh_token: tokenRow.refresh_token,
              grant_type: "refresh_token",
            }),
          });
          const newTokens = await tokenRes.json();
          if (tokenRes.ok) {
            accessToken = newTokens.access_token;
            await supabaseAdmin.from("google_tokens").update({
              access_token: newTokens.access_token,
              expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
            }).eq("user_id", userId);
          } else {
            return "⚠️ Google token expired and refresh failed. Please reconnect Google in Settings.";
          }
        }
      }

      const results: string[] = [];
      for (const event of args.events || []) {
        try {
          const eventDate = new Date(event.date);
          const calRes = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                summary: event.title,
                description: event.description || "",
                start: { date: event.date },
                end: { date: event.date },
                reminders: {
                  useDefault: false,
                  overrides: [
                    { method: "popup", minutes: 7 * 24 * 60 },
                    { method: "popup", minutes: 3 * 24 * 60 },
                    { method: "popup", minutes: 1 * 24 * 60 },
                  ],
                },
              }),
            }
          );
          if (calRes.ok) {
            results.push(`📅 "${event.title}" added to Google Calendar`);
          } else {
            results.push(`⚠️ Failed to add "${event.title}" to calendar`);
          }
        } catch {
          results.push(`⚠️ Failed to add "${event.title}" to calendar`);
        }
      }
      return results.join("\n");
    }
    default:
      return `Unknown tool: ${toolName}`;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    let userId: string | null = null;
    if (authHeader) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      userId = user?.id || null;
    }

    // Check if user has Google Calendar connected
    let hasGoogleCalendar = false;
    if (userId) {
      const { data: gToken } = await supabaseAdmin.from("google_tokens").select("id").eq("user_id", userId).single();
      hasGoogleCalendar = !!gToken;
    }

    let systemPrompt = `You are StudyOS, an academic advisor and mentor built into a student's study management app. You are direct, honest, motivating without being sycophantic. You know this student's goals and hold them to it.

CRITICAL RULE: When a student asks you to add, create, log, or record ANYTHING (modules, assessments, marks, goals, timetable entries, study sessions), you MUST use the appropriate tool function. NEVER just say you did it — actually call the tool. If you don't call a tool, the data won't be saved.

Available actions via tools:
- add_module: Create a new module/course
- add_assessment: Add a test, assignment, exam to a module
- log_mark: Record a grade for an assessment
- add_goal: Create a goal
- add_timetable_entry: Add to weekly timetable (0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun)
- update_timetable_entry: Update an existing timetable entry (change time, day, title, location)
- delete_timetable_entry: Remove a timetable entry
- log_study_session: Log study time
- bulk_create_from_document: Bulk create modules + assessments from uploaded documents
- create_calendar_events: Add events to Google Calendar${hasGoogleCalendar ? ' (CONNECTED - use this when creating assessments with dates)' : ' (NOT connected)'}

When a student uploads a document (course outline, syllabus, transcript), use bulk_create_from_document to automatically create ALL modules and assessments with dates and weightings.

When you perform an action, confirm what you did and offer next steps.`;

    if (context) {
      systemPrompt += `\n\nStudent Context:\n${context}`;
    }

    let modules: any[] = [];
    if (userId) {
      const { data } = await supabaseAdmin.from("modules").select("*").eq("user_id", userId);
      modules = data || [];
    }

    const aiMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    // First call - may return tool calls
    const firstResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: aiMessages,
        tools: userId ? TOOLS : undefined,
        tool_choice: userId ? "auto" : undefined,
        stream: false,
      }),
    });

    if (!firstResponse.ok) {
      const status = firstResponse.status;
      const text = await firstResponse.text();
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please wait a moment and try again." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI error:", status, text);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const firstData = await firstResponse.json();
    const choice = firstData.choices?.[0];
    console.log("AI finish_reason:", choice?.finish_reason, "has_tool_calls:", !!choice?.message?.tool_calls?.length);

    // Check for tool calls
    if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0 && userId) {
      const toolResults: string[] = [];
      const toolMessages = [...aiMessages, choice.message];

      for (const toolCall of choice.message.tool_calls) {
        const fnName = toolCall.function.name;
        let fnArgs: any;
        try {
          fnArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          fnArgs = {};
        }
        console.log("Executing tool:", fnName, "args:", JSON.stringify(fnArgs));
        const result = await executeTool(supabaseAdmin, userId, fnName, fnArgs, modules);
        console.log("Tool result:", result);
        toolResults.push(result);
        toolMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        } as any);
      }

      // Second call to get final response after tool execution
      const secondResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: toolMessages,
          stream: true,
        }),
      });

      if (!secondResponse.ok) {
        const fallbackContent = toolResults.join("\n\n");
        return new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: fallbackContent } }],
            tool_results: toolResults,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Encode tool results as base64 to avoid ByteString issues with emojis
      const encodedResults = btoa(unescape(encodeURIComponent(JSON.stringify(toolResults))));
      return new Response(secondResponse.body, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "X-Tool-Results": encodedResults,
        },
      });
    }

    // No tool calls - stream the response
    const streamResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: aiMessages,
        stream: true,
      }),
    });

    if (!streamResponse.ok) {
      const text = await streamResponse.text();
      console.error("Stream error:", text);
      return new Response(JSON.stringify(firstData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(streamResponse.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
