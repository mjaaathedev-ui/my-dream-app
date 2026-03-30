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
      description: "Add an assessment (test, assignment, exam, practical, project) to a module",
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
          day_of_week: { type: "number", description: "0=Sunday, 1=Monday...6=Saturday" },
          start_time: { type: "string", description: "HH:MM format" },
          end_time: { type: "string", description: "HH:MM format" },
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
          color: args.color || "#2563EB",
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
      return `✅ Assessment "${args.name}" (${args.type}, ${args.weight_percent}%) added to ${mod.name}.`;
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
      return `✅ Timetable entry "${args.title}" added.`;
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

    // Get user from auth header
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

    // Build system prompt with context
    let systemPrompt = `You are StudyOS, an academic advisor and mentor built into a student's study management app. You are direct, honest, motivating without being sycophantic. You know this student's goals and hold them to it. Help them understand their material, prepare for assessments, and stay on track.

You can take actions on behalf of the student using the tools provided. When a student mentions adding modules, assessments, study sessions, goals, or timetable entries, USE THE TOOLS to do it for them automatically. Don't just tell them how - actually do it.

When you perform an action, confirm what you did and offer next steps.`;

    if (context) {
      systemPrompt += `\n\nStudent Context:\n${context}`;
    }

    // Get modules for tool execution
    let modules: any[] = [];
    if (userId) {
      const { data } = await supabaseAdmin.from("modules").select("*").eq("user_id", userId);
      modules = data || [];
    }

    // Prepare messages for AI
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
        const result = await executeTool(supabaseAdmin, userId, fnName, fnArgs, modules);
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
        // Fall back to returning tool results directly
        const fallbackContent = toolResults.join("\n\n");
        return new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: fallbackContent } }],
            tool_results: toolResults,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(secondResponse.body, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "X-Tool-Results": JSON.stringify(toolResults),
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
      // Return non-streamed response from first call
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
