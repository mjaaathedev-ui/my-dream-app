import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODEL = "google/gemini-2.5-flash";
const MAX_TOOL_ROUNDS = 5;

const MODULE_COLORS = [
  "#2563EB", "#DC2626", "#16A34A", "#D97706", "#7C3AED",
  "#DB2777", "#0891B2", "#65A30D", "#EA580C", "#4F46E5",
];

const TOOLS = [
  // ── MODULES ───────────────────────────────────────────────────────────────
  { type: "function", function: { name: "add_module",
    description: "Add a new academic module/course",
    parameters: { type: "object", properties: {
      name: { type: "string" }, code: { type: "string" },
      credit_weight: { type: "number" }, color: { type: "string" }, semester: { type: "string" },
    }, required: ["name"] } } },
  { type: "function", function: { name: "update_module",
    description: "Update an existing module (rename, change credits, color, semester, notes)",
    parameters: { type: "object", properties: {
      current_name: { type: "string", description: "Current module name or code" },
      new_name: { type: "string" }, new_code: { type: "string" },
      credit_weight: { type: "number" }, color: { type: "string" },
      semester: { type: "string" }, notes: { type: "string" },
    }, required: ["current_name"] } } },
  { type: "function", function: { name: "delete_module",
    description: "Archive (soft-delete) a module. Use when student dropped a course.",
    parameters: { type: "object", properties: {
      name: { type: "string", description: "Module name or code" },
    }, required: ["name"] } } },

  // ── ASSESSMENTS ───────────────────────────────────────────────────────────
  { type: "function", function: { name: "add_assessment",
    description: "Add a test/assignment/exam/practical/project to a module",
    parameters: { type: "object", properties: {
      module_name: { type: "string" }, name: { type: "string" },
      type: { type: "string", enum: ["test","assignment","exam","practical","project"] },
      weight_percent: { type: "number" }, due_date: { type: "string", description: "YYYY-MM-DD" },
      max_mark: { type: "number" },
    }, required: ["module_name","name","type","weight_percent"] } } },
  { type: "function", function: { name: "update_assessment",
    description: "Update an existing assessment (rename, change due date, weight, max mark)",
    parameters: { type: "object", properties: {
      module_name: { type: "string" }, current_name: { type: "string" },
      new_name: { type: "string" }, new_type: { type: "string", enum: ["test","assignment","exam","practical","project"] },
      due_date: { type: "string", description: "YYYY-MM-DD" },
      weight_percent: { type: "number" }, max_mark: { type: "number" },
    }, required: ["module_name","current_name"] } } },
  { type: "function", function: { name: "delete_assessment",
    description: "Delete an assessment from a module",
    parameters: { type: "object", properties: {
      module_name: { type: "string" }, assessment_name: { type: "string" },
    }, required: ["module_name","assessment_name"] } } },
  { type: "function", function: { name: "log_mark",
    description: "Record a mark for an existing assessment",
    parameters: { type: "object", properties: {
      module_name: { type: "string" }, assessment_name: { type: "string" }, mark: { type: "number" },
    }, required: ["module_name","assessment_name","mark"] } } },

  // ── GOALS ─────────────────────────────────────────────────────────────────
  { type: "function", function: { name: "add_goal",
    description: "Create a goal. ONLY call after user confirms the proposed payload.",
    parameters: { type: "object", properties: {
      title: { type: "string" }, description: { type: "string" },
      type: { type: "string", enum: ["semester","module","career","funding"] },
      target_value: { type: "number" }, deadline: { type: "string", description: "YYYY-MM-DD" },
    }, required: ["title","type"] } } },
  { type: "function", function: { name: "update_goal",
    description: "Update an existing goal (title, description, target, deadline, current progress).",
    parameters: { type: "object", properties: {
      current_title: { type: "string" },
      new_title: { type: "string" }, new_description: { type: "string" },
      target_value: { type: "number" }, current_value: { type: "number" },
      deadline: { type: "string", description: "YYYY-MM-DD" },
    }, required: ["current_title"] } } },
  { type: "function", function: { name: "delete_goal",
    description: "Delete a goal by title.",
    parameters: { type: "object", properties: { title: { type: "string" } }, required: ["title"] } } },
  { type: "function", function: { name: "complete_goal",
    description: "Mark a goal as achieved",
    parameters: { type: "object", properties: { title: { type: "string" } }, required: ["title"] } } },

  // ── PROFILE ───────────────────────────────────────────────────────────────
  { type: "function", function: { name: "update_profile",
    description: "Update the student's profile (target average, study target hours, career goal, etc.)",
    parameters: { type: "object", properties: {
      full_name: { type: "string" }, institution: { type: "string" },
      degree: { type: "string" }, year_of_study: { type: "string" },
      career_goal: { type: "string" }, career_field: { type: "string" },
      why_it_matters: { type: "string" },
      target_average: { type: "number" }, daily_study_target_hours: { type: "number" },
      funding_condition: { type: "string" }, has_funding_condition: { type: "boolean" },
    } } } },

  // ── JOURNAL ───────────────────────────────────────────────────────────────
  { type: "function", function: { name: "add_journal_entry",
    description: "Save a reflection / future-self / monthly-review journal entry",
    parameters: { type: "object", properties: {
      entry_type: { type: "string", enum: ["reflection","future_self","monthly_review"] },
      content: { type: "string" }, module_name: { type: "string" },
    }, required: ["entry_type","content"] } } },

  // ── ASSESSMENT EXTRAS ─────────────────────────────────────────────────────
  { type: "function", function: { name: "mark_assessment_submitted",
    description: "Mark an assessment as submitted without recording a mark yet",
    parameters: { type: "object", properties: {
      module_name: { type: "string" }, assessment_name: { type: "string" },
      submitted: { type: "boolean" },
    }, required: ["module_name","assessment_name"] } } },

  // ── TASKS ─────────────────────────────────────────────────────────────────
  { type: "function", function: { name: "add_task",
    description: "Add a task to a module's todo list",
    parameters: { type: "object", properties: {
      module_name: { type: "string" }, title: { type: "string" }, notes: { type: "string" },
      due_date: { type: "string", description: "YYYY-MM-DD" },
    }, required: ["module_name","title"] } } },
  { type: "function", function: { name: "update_task",
    description: "Update task title, status, due date, or notes",
    parameters: { type: "object", properties: {
      current_title: { type: "string" },
      new_title: { type: "string" }, new_notes: { type: "string" },
      status: { type: "string", enum: ["not_started","in_progress","almost_done","done"] },
      due_date: { type: "string", description: "YYYY-MM-DD" },
    }, required: ["current_title"] } } },
  { type: "function", function: { name: "delete_task",
    description: "Delete a task by title",
    parameters: { type: "object", properties: { title: { type: "string" } }, required: ["title"] } } },

  // ── TIMETABLE (full calendar) ─────────────────────────────────────────────
  { type: "function", function: { name: "add_timetable_entry",
    description: "Add a calendar event. Use entry_type='once' with specific_date for one-off events like a test on a specific day; use entry_type='recurring' with day_of_week (0=Mon..6=Sun) for weekly classes. Priority 1=low..5=critical; tests/exams should be 4–5.",
    parameters: { type: "object", properties: {
      title: { type: "string" },
      type: { type: "string", enum: ["class","tutorial","practical","study","personal","assessment"] },
      entry_type: { type: "string", enum: ["once","recurring"], description: "Default 'recurring'" },
      specific_date: { type: "string", description: "YYYY-MM-DD — required when entry_type='once'" },
      day_of_week: { type: "number", description: "0=Mon..6=Sun — required when entry_type='recurring'" },
      recurrence: { type: "string", enum: ["weekly","biweekly","monthly"] },
      start_time: { type: "string" }, end_time: { type: "string" },
      location: { type: "string" }, notes: { type: "string" }, category: { type: "string" },
      priority: { type: "number", description: "1 (low) to 5 (critical)" },
      module_name: { type: "string" },
    }, required: ["title","type","start_time","end_time"] } } },
  { type: "function", function: { name: "update_timetable_entry",
    description: "Update an existing calendar event (reschedule, change priority, change location, etc.)",
    parameters: { type: "object", properties: {
      current_title: { type: "string" }, day_of_week: { type: "number" },
      new_title: { type: "string" }, new_type: { type: "string", enum: ["class","tutorial","practical","study","personal","assessment"] },
      new_entry_type: { type: "string", enum: ["once","recurring"] },
      new_specific_date: { type: "string", description: "YYYY-MM-DD" },
      new_day_of_week: { type: "number" }, new_recurrence: { type: "string", enum: ["weekly","biweekly","monthly"] },
      new_start_time: { type: "string" }, new_end_time: { type: "string" },
      new_location: { type: "string" }, new_notes: { type: "string" }, new_category: { type: "string" },
      new_priority: { type: "number" }, new_status: { type: "string", enum: ["scheduled","cancelled","completed"] },
      module_name: { type: "string" },
    }, required: ["current_title"] } } },
  { type: "function", function: { name: "delete_timetable_entry",
    description: "Permanently delete a calendar event by title",
    parameters: { type: "object", properties: {
      title: { type: "string" }, day_of_week: { type: "number" },
    }, required: ["title"] } } },
  { type: "function", function: { name: "cancel_timetable_entry",
    description: "Cancel an event without deleting it (sets status='cancelled'). Use when student says a class is cancelled or postponed.",
    parameters: { type: "object", properties: {
      title: { type: "string" }, day_of_week: { type: "number" },
    }, required: ["title"] } } },
  { type: "function", function: { name: "list_timetable_entries",
    description: "List upcoming calendar events filtered by date range or priority. Read-only — no confirmation needed.",
    parameters: { type: "object", properties: {
      from_date: { type: "string", description: "YYYY-MM-DD" },
      to_date: { type: "string", description: "YYYY-MM-DD" },
      min_priority: { type: "number" },
      include_passed: { type: "boolean" },
    } } } },

  // ── STUDY SESSIONS ────────────────────────────────────────────────────────
  { type: "function", function: { name: "log_study_session",
    description: "Log a completed study session",
    parameters: { type: "object", properties: {
      module_name: { type: "string" }, duration_minutes: { type: "number" },
      topic: { type: "string" }, energy_level: { type: "number", description: "1-5" },
    }, required: ["module_name","duration_minutes"] } } },

  // ── BULK + CALENDAR ───────────────────────────────────────────────────────
  { type: "function", function: { name: "bulk_create_from_document",
    description: "Bulk create modules + assessments from a parsed document",
    parameters: { type: "object", properties: {
      modules: { type: "array", items: { type: "object", properties: {
        name: { type: "string" }, code: { type: "string" },
        credit_weight: { type: "number" }, semester: { type: "string" },
        assessments: { type: "array", items: { type: "object", properties: {
          name: { type: "string" }, type: { type: "string", enum: ["test","assignment","exam","practical","project"] },
          weight_percent: { type: "number" }, due_date: { type: "string" },
          max_mark: { type: "number" }, mark_achieved: { type: "number" },
        }, required: ["name","type","weight_percent"] } },
      }, required: ["name","assessments"] } },
    }, required: ["modules"] } } },
  { type: "function", function: { name: "create_calendar_events",
    description: "Create Google Calendar events. Only call if Google Calendar is connected.",
    parameters: { type: "object", properties: {
      events: { type: "array", items: { type: "object", properties: {
        title: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD" },
        description: { type: "string" },
      }, required: ["title","date"] } },
    }, required: ["events"] } } },
];

// ─── helpers ───────────────────────────────────────────────────────────────
const findModule = (modules: any[], name: string) => {
  if (!name) return null;
  const lower = name.toLowerCase();
  return modules.find((m: any) =>
    m.name?.toLowerCase() === lower ||
    m.code?.toLowerCase() === lower ||
    m.name?.toLowerCase().includes(lower) ||
    lower.includes(m.name?.toLowerCase())
  );
};

async function executeTool(
  supabaseAdmin: any,
  userId: string,
  toolName: string,
  args: any,
  modules: any[]
): Promise<string> {
  try {
    switch (toolName) {
      case "add_module": {
        const { data, error } = await supabaseAdmin.from("modules").insert({
          user_id: userId, name: args.name, code: args.code || "",
          credit_weight: args.credit_weight || 16,
          color: args.color || MODULE_COLORS[modules.length % MODULE_COLORS.length],
          semester: args.semester || "", sort_order: modules.length,
        }).select().single();
        if (error) return `Error adding module: ${error.message}`;
        modules.push(data);
        return `✅ Module "${args.name}" added.`;
      }
      case "update_module": {
        const mod = findModule(modules, args.current_name);
        if (!mod) return `❌ Module "${args.current_name}" not found.`;
        const updates: any = {};
        if (args.new_name) updates.name = args.new_name;
        if (args.new_code) updates.code = args.new_code;
        if (args.credit_weight != null) updates.credit_weight = args.credit_weight;
        if (args.color) updates.color = args.color;
        if (args.semester) updates.semester = args.semester;
        if (args.notes != null) updates.notes = args.notes;
        if (!Object.keys(updates).length) return `⚠️ No changes specified.`;
        const { error } = await supabaseAdmin.from("modules").update(updates).eq("id", mod.id);
        if (error) return `Error: ${error.message}`;
        Object.assign(mod, updates);
        return `✅ Updated module "${mod.name}".`;
      }
      case "delete_module": {
        const mod = findModule(modules, args.name);
        if (!mod) return `❌ Module "${args.name}" not found.`;
        const { error } = await supabaseAdmin.from("modules").update({ archived: true }).eq("id", mod.id);
        if (error) return `Error: ${error.message}`;
        return `✅ Module "${mod.name}" archived.`;
      }
      case "add_assessment": {
        const mod = findModule(modules, args.module_name);
        if (!mod) return `❌ Module "${args.module_name}" not found. Available: ${modules.map((m:any)=>m.name).join(", ")}`;
        const { error } = await supabaseAdmin.from("assessments").insert({
          user_id: userId, module_id: mod.id, name: args.name, type: args.type,
          weight_percent: args.weight_percent, due_date: args.due_date || null,
          max_mark: args.max_mark || 100,
        });
        if (error) return `Error: ${error.message}`;
        return `✅ "${args.name}" (${args.type}, ${args.weight_percent}%) added to ${mod.name}.${args.due_date ? ` Due ${args.due_date}.` : ''}`;
      }
      case "update_assessment": {
        const mod = findModule(modules, args.module_name);
        if (!mod) return `❌ Module "${args.module_name}" not found.`;
        const { data: rows } = await supabaseAdmin.from("assessments").select("*")
          .eq("user_id", userId).eq("module_id", mod.id);
        const a = (rows || []).find((r: any) =>
          r.name.toLowerCase().includes(args.current_name.toLowerCase()) ||
          args.current_name.toLowerCase().includes(r.name.toLowerCase()));
        if (!a) return `❌ Assessment "${args.current_name}" not found in ${mod.name}.`;
        const updates: any = {};
        if (args.new_name) updates.name = args.new_name;
        if (args.new_type) updates.type = args.new_type;
        if (args.due_date != null) updates.due_date = args.due_date;
        if (args.weight_percent != null) updates.weight_percent = args.weight_percent;
        if (args.max_mark != null) updates.max_mark = args.max_mark;
        if (!Object.keys(updates).length) return `⚠️ No changes specified.`;
        const { error } = await supabaseAdmin.from("assessments").update(updates).eq("id", a.id);
        if (error) return `Error: ${error.message}`;
        return `✅ Updated assessment "${a.name}".`;
      }
      case "delete_assessment": {
        const mod = findModule(modules, args.module_name);
        if (!mod) return `❌ Module "${args.module_name}" not found.`;
        const { data: rows } = await supabaseAdmin.from("assessments").select("*")
          .eq("user_id", userId).eq("module_id", mod.id);
        const a = (rows || []).find((r: any) =>
          r.name.toLowerCase().includes(args.assessment_name.toLowerCase()));
        if (!a) return `❌ Assessment "${args.assessment_name}" not found.`;
        const { error } = await supabaseAdmin.from("assessments").delete().eq("id", a.id);
        if (error) return `Error: ${error.message}`;
        return `✅ Deleted assessment "${a.name}".`;
      }
      case "log_mark": {
        const mod = findModule(modules, args.module_name);
        if (!mod) return `❌ Module "${args.module_name}" not found.`;
        const { data: rows } = await supabaseAdmin.from("assessments").select("*")
          .eq("user_id", userId).eq("module_id", mod.id);
        const a = (rows || []).find((r: any) =>
          r.name.toLowerCase().includes(args.assessment_name.toLowerCase()) ||
          args.assessment_name.toLowerCase().includes(r.name.toLowerCase()));
        if (!a) return `❌ Assessment "${args.assessment_name}" not found in ${mod.name}.`;
        const { error } = await supabaseAdmin.from("assessments")
          .update({ mark_achieved: args.mark, submitted: true }).eq("id", a.id);
        if (error) return `Error: ${error.message}`;
        return `✅ Mark ${args.mark}/${a.max_mark} recorded for "${a.name}".`;
      }
      case "add_goal": {
        const { error } = await supabaseAdmin.from("goals").insert({
          user_id: userId, title: args.title, description: args.description || "",
          type: args.type, target_value: args.target_value || null,
          deadline: args.deadline || null,
        });
        if (error) return `Error: ${error.message}`;
        return `✅ Goal "${args.title}" created.`;
      }
      case "update_goal": {
        const { data: rows } = await supabaseAdmin.from("goals").select("*").eq("user_id", userId);
        const g = (rows || []).find((r: any) =>
          r.title.toLowerCase().includes(args.current_title.toLowerCase()) ||
          args.current_title.toLowerCase().includes(r.title.toLowerCase()));
        if (!g) return `❌ Goal "${args.current_title}" not found.`;
        const updates: any = {};
        if (args.new_title) updates.title = args.new_title;
        if (args.new_description != null) updates.description = args.new_description;
        if (args.target_value != null) updates.target_value = args.target_value;
        if (args.current_value != null) updates.current_value = args.current_value;
        if (args.deadline != null) updates.deadline = args.deadline;
        if (!Object.keys(updates).length) return `⚠️ No changes specified.`;
        const { error } = await supabaseAdmin.from("goals").update(updates).eq("id", g.id);
        if (error) return `Error: ${error.message}`;
        return `✅ Updated goal "${g.title}".`;
      }
      case "delete_goal": {
        const { data: rows } = await supabaseAdmin.from("goals").select("*").eq("user_id", userId);
        const g = (rows || []).find((r: any) =>
          r.title.toLowerCase().includes(args.title.toLowerCase()));
        if (!g) return `❌ Goal "${args.title}" not found.`;
        const { error } = await supabaseAdmin.from("goals").delete().eq("id", g.id);
        if (error) return `Error: ${error.message}`;
        return `✅ Deleted goal "${g.title}".`;
      }
      case "complete_goal": {
        const { data: rows } = await supabaseAdmin.from("goals").select("*").eq("user_id", userId);
        const g = (rows || []).find((r: any) =>
          r.title.toLowerCase().includes(args.title.toLowerCase()) ||
          args.title.toLowerCase().includes(r.title.toLowerCase()));
        if (!g) return `❌ Goal "${args.title}" not found.`;
        const { error } = await supabaseAdmin.from("goals")
          .update({ achieved: true }).eq("id", g.id);
        if (error) return `Error: ${error.message}`;
        return `✅ Goal "${g.title}" marked achieved. 🎉`;
      }
      case "update_profile": {
        const updates: any = {};
        for (const k of ["full_name","institution","degree","year_of_study","career_goal","career_field","why_it_matters","target_average","daily_study_target_hours","funding_condition","has_funding_condition"]) {
          if (args[k] !== undefined) updates[k] = args[k];
        }
        if (!Object.keys(updates).length) return `⚠️ No profile changes specified.`;
        const { error } = await supabaseAdmin.from("users_profile").update(updates).eq("user_id", userId);
        if (error) return `Error: ${error.message}`;
        return `✅ Profile updated: ${Object.keys(updates).join(", ")}.`;
      }
      case "add_journal_entry": {
        let moduleId: string | null = null;
        if (args.module_name) { const m = findModule(modules, args.module_name); if (m) moduleId = m.id; }
        const { error } = await supabaseAdmin.from("journal_entries").insert({
          user_id: userId, entry_type: args.entry_type, content: args.content, module_id: moduleId,
        });
        if (error) return `Error: ${error.message}`;
        return `✅ ${args.entry_type.replace('_',' ')} saved.`;
      }
      case "mark_assessment_submitted": {
        const mod = findModule(modules, args.module_name);
        if (!mod) return `❌ Module "${args.module_name}" not found.`;
        const { data: rows } = await supabaseAdmin.from("assessments").select("*")
          .eq("user_id", userId).eq("module_id", mod.id);
        const a = (rows || []).find((r: any) =>
          r.name.toLowerCase().includes(args.assessment_name.toLowerCase()));
        if (!a) return `❌ Assessment "${args.assessment_name}" not found.`;
        const submitted = args.submitted ?? true;
        const { error } = await supabaseAdmin.from("assessments")
          .update({ submitted }).eq("id", a.id);
        if (error) return `Error: ${error.message}`;
        return `✅ "${a.name}" marked ${submitted ? 'submitted' : 'not submitted'}.`;
      }
      case "add_task": {
        const mod = findModule(modules, args.module_name);
        if (!mod) return `❌ Module "${args.module_name}" not found.`;
        const { error } = await supabaseAdmin.from("tasks").insert({
          user_id: userId, module_id: mod.id, title: args.title,
          notes: args.notes || "", due_date: args.due_date || null,
          status: "not_started",
        });
        if (error) return `Error: ${error.message}`;
        return `✅ Task "${args.title}" added to ${mod.name}.`;
      }
      case "update_task": {
        const { data: rows } = await supabaseAdmin.from("tasks").select("*").eq("user_id", userId);
        const t = (rows || []).find((r: any) =>
          r.title.toLowerCase().includes(args.current_title.toLowerCase()));
        if (!t) return `❌ Task "${args.current_title}" not found.`;
        const updates: any = {};
        if (args.new_title) updates.title = args.new_title;
        if (args.new_notes != null) updates.notes = args.new_notes;
        if (args.status) updates.status = args.status;
        if (args.due_date != null) updates.due_date = args.due_date;
        if (!Object.keys(updates).length) return `⚠️ No changes specified.`;
        const { error } = await supabaseAdmin.from("tasks").update(updates).eq("id", t.id);
        if (error) return `Error: ${error.message}`;
        return `✅ Updated task "${t.title}".`;
      }
      case "delete_task": {
        const { data: rows } = await supabaseAdmin.from("tasks").select("*").eq("user_id", userId);
        const t = (rows || []).find((r: any) =>
          r.title.toLowerCase().includes(args.title.toLowerCase()));
        if (!t) return `❌ Task "${args.title}" not found.`;
        const { error } = await supabaseAdmin.from("tasks").delete().eq("id", t.id);
        if (error) return `Error: ${error.message}`;
        return `✅ Deleted task "${t.title}".`;
      }
      case "add_timetable_entry": {
        let moduleId = null;
        if (args.module_name) {
          const m = findModule(modules, args.module_name); if (m) moduleId = m.id;
        }
        const entryType = args.entry_type || (args.specific_date ? "once" : "recurring");
        let dow = args.day_of_week;
        if (entryType === "once" && args.specific_date) {
          const d = new Date(args.specific_date + "T00:00:00");
          dow = (d.getDay() + 6) % 7;
        }
        if (dow === undefined || dow === null) return `❌ Need day_of_week (recurring) or specific_date (once).`;
        const { error } = await supabaseAdmin.from("timetable_entries").insert({
          user_id: userId, title: args.title, type: args.type,
          entry_type: entryType,
          specific_date: entryType === "once" ? args.specific_date : null,
          recurrence: entryType === "recurring" ? (args.recurrence || "weekly") : "weekly",
          day_of_week: dow, start_time: args.start_time, end_time: args.end_time,
          location: args.location || "", notes: args.notes || null,
          category: args.category || null,
          priority: args.priority ?? (args.type === "assessment" ? 5 : 3),
          status: "scheduled",
          recurring: entryType === "recurring",
          module_id: moduleId,
        });
        if (error) return `Error: ${error.message}`;
        const dn = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
        const when = entryType === "once" ? args.specific_date : dn[dow];
        return `✅ "${args.title}" added on ${when} ${args.start_time}–${args.end_time}${args.priority ? ` (priority ${args.priority})` : ''}.`;
      }
      case "update_timetable_entry": {
        const dn = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
        let q = supabaseAdmin.from("timetable_entries").select("*").eq("user_id", userId).ilike("title", `%${args.current_title}%`);
        if (args.day_of_week !== undefined) q = q.eq("day_of_week", args.day_of_week);
        const { data: entries } = await q;
        if (!entries || entries.length === 0) return `❌ No entry matching "${args.current_title}".`;
        const e = entries[0];
        const updates: any = {};
        if (args.new_title) updates.title = args.new_title;
        if (args.new_type) updates.type = args.new_type;
        if (args.new_entry_type) {
          updates.entry_type = args.new_entry_type;
          updates.recurring = args.new_entry_type === "recurring";
        }
        if (args.new_specific_date !== undefined) {
          updates.specific_date = args.new_specific_date;
          if (args.new_specific_date) {
            const d = new Date(args.new_specific_date + "T00:00:00");
            updates.day_of_week = (d.getDay() + 6) % 7;
          }
        }
        if (args.new_day_of_week !== undefined) updates.day_of_week = args.new_day_of_week;
        if (args.new_recurrence) updates.recurrence = args.new_recurrence;
        if (args.new_start_time) updates.start_time = args.new_start_time;
        if (args.new_end_time) updates.end_time = args.new_end_time;
        if (args.new_location !== undefined) updates.location = args.new_location;
        if (args.new_notes !== undefined) updates.notes = args.new_notes;
        if (args.new_category !== undefined) updates.category = args.new_category;
        if (args.new_priority !== undefined) updates.priority = args.new_priority;
        if (args.new_status) updates.status = args.new_status;
        if (args.module_name) {
          const m = findModule(modules, args.module_name); if (m) updates.module_id = m.id;
        }
        if (!Object.keys(updates).length) return `⚠️ No changes specified.`;
        const { error } = await supabaseAdmin.from("timetable_entries").update(updates).eq("id", e.id);
        if (error) return `Error: ${error.message}`;
        return `✅ Updated "${e.title}"${updates.day_of_week !== undefined ? ` → ${dn[updates.day_of_week]}` : ''}${updates.status ? ` (${updates.status})` : ''}.`;
      }
      case "delete_timetable_entry": {
        let q = supabaseAdmin.from("timetable_entries").select("*").eq("user_id", userId).ilike("title", `%${args.title}%`);
        if (args.day_of_week !== undefined) q = q.eq("day_of_week", args.day_of_week);
        const { data: entries } = await q;
        if (!entries || entries.length === 0) return `❌ No entry matching "${args.title}".`;
        const { error } = await supabaseAdmin.from("timetable_entries").delete().eq("id", entries[0].id);
        if (error) return `Error: ${error.message}`;
        return `✅ Deleted "${entries[0].title}".`;
      }
      case "cancel_timetable_entry": {
        let q = supabaseAdmin.from("timetable_entries").select("*").eq("user_id", userId).ilike("title", `%${args.title}%`);
        if (args.day_of_week !== undefined) q = q.eq("day_of_week", args.day_of_week);
        const { data: entries } = await q;
        if (!entries || entries.length === 0) return `❌ No entry matching "${args.title}".`;
        const { error } = await supabaseAdmin.from("timetable_entries").update({ status: "cancelled" }).eq("id", entries[0].id);
        if (error) return `Error: ${error.message}`;
        return `🚫 Cancelled "${entries[0].title}".`;
      }
      case "list_timetable_entries": {
        let q = supabaseAdmin.from("timetable_entries").select("*").eq("user_id", userId);
        if (args.min_priority) q = q.gte("priority", args.min_priority);
        const { data: rows } = await q.order("specific_date", { ascending: true });
        const today = new Date().toISOString().slice(0, 10);
        const filtered = (rows || []).filter((e: any) => {
          if (!args.include_passed && e.entry_type === "once" && e.specific_date && e.specific_date < today) return false;
          if (args.from_date && e.specific_date && e.specific_date < args.from_date) return false;
          if (args.to_date && e.specific_date && e.specific_date > args.to_date) return false;
          return true;
        });
        if (!filtered.length) return "📭 No matching events.";
        const dn = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
        return filtered.slice(0, 20).map((e: any) => {
          const when = e.entry_type === "once" ? e.specific_date : `${dn[e.day_of_week]} (${e.recurrence})`;
          return `• ${e.title} — ${when} ${e.start_time}–${e.end_time} | P${e.priority} | ${e.status}`;
        }).join("\n");
      }
      case "log_study_session": {
        const mod = findModule(modules, args.module_name);
        if (!mod) return `❌ Module "${args.module_name}" not found.`;
        const now = new Date();
        const started = new Date(now.getTime() - args.duration_minutes * 60000);
        const { error } = await supabaseAdmin.from("study_sessions").insert({
          user_id: userId, module_id: mod.id, started_at: started.toISOString(),
          ended_at: now.toISOString(), duration_minutes: args.duration_minutes,
          topic: args.topic || "", energy_level: args.energy_level || 3, session_type: "custom",
        });
        if (error) return `Error: ${error.message}`;
        return `✅ ${args.duration_minutes}min logged for ${mod.name}.`;
      }
      case "bulk_create_from_document": {
        const results: string[] = [];
        for (const md of args.modules || []) {
          let mod = findModule(modules, md.name) || (md.code ? findModule(modules, md.code) : null);
          if (!mod) {
            const { data, error } = await supabaseAdmin.from("modules").insert({
              user_id: userId, name: md.name, code: md.code || "",
              credit_weight: md.credit_weight || 16,
              color: MODULE_COLORS[modules.length % MODULE_COLORS.length],
              semester: md.semester || "", sort_order: modules.length,
            }).select().single();
            if (error) { results.push(`❌ ${md.name}: ${error.message}`); continue; }
            mod = data; modules.push(data);
            results.push(`✅ Module "${md.name}" created.`);
          } else results.push(`📝 "${md.name}" already exists.`);
          const ass = md.assessments || [];
          if (ass.length) {
            const rows = ass.map((a: any) => ({
              user_id: userId, module_id: mod.id, name: a.name,
              type: a.type || "assignment", weight_percent: a.weight_percent || 0,
              due_date: a.due_date || null, max_mark: a.max_mark || 100,
              mark_achieved: a.mark_achieved ?? null, submitted: a.mark_achieved != null,
            }));
            const { error } = await supabaseAdmin.from("assessments").insert(rows);
            results.push(error ? `  ❌ ${error.message}` : `  ✅ ${ass.length} assessment(s) added.`);
          }
        }
        return results.join("\n");
      }
      case "create_calendar_events": {
        const { data: tokenRow } = await supabaseAdmin.from("google_tokens")
          .select("*").eq("user_id", userId).maybeSingle();
        if (!tokenRow) return "⚠️ Google Calendar not connected.";
        const { data: profileData } = await supabaseAdmin.from("users_profile")
          .select("google_calendar_id").eq("user_id", userId).maybeSingle();
        const calendarId = profileData?.google_calendar_id || "primary";
        let accessToken = tokenRow.access_token;
        if (new Date(tokenRow.expires_at) < new Date()) {
          const cid = Deno.env.get("GOOGLE_CLIENT_ID");
          const csec = Deno.env.get("GOOGLE_CLIENT_SECRET");
          if (cid && csec) {
            const tr = await fetch("https://oauth2.googleapis.com/token", {
              method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                client_id: cid, client_secret: csec,
                refresh_token: tokenRow.refresh_token, grant_type: "refresh_token",
              }),
            });
            const nt = await tr.json();
            if (tr.ok) {
              accessToken = nt.access_token;
              await supabaseAdmin.from("google_tokens").update({
                access_token: nt.access_token,
                expires_at: new Date(Date.now() + nt.expires_in * 1000).toISOString(),
              }).eq("user_id", userId);
            } else return "⚠️ Google token refresh failed. Reconnect in Settings.";
          }
        }
        const results: string[] = [];
        for (const ev of args.events || []) {
          try {
            const r = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
              { method: "POST",
                headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  summary: ev.title, description: ev.description || "",
                  start: { date: ev.date }, end: { date: ev.date },
                  reminders: { useDefault: false, overrides: [
                    { method: "popup", minutes: 7*24*60 },
                    { method: "popup", minutes: 3*24*60 },
                    { method: "popup", minutes: 1*24*60 },
                  ] },
                }) });
            results.push(r.ok ? `📅 "${ev.title}" added` : `⚠️ Failed "${ev.title}"`);
          } catch { results.push(`⚠️ Failed "${ev.title}"`); }
        }
        return results.join("\n");
      }
      default: return `Unknown tool: ${toolName}`;
    }
  } catch (e: any) {
    console.error(`Tool ${toolName} crashed:`, e);
    return `❌ Tool ${toolName} failed: ${e?.message || String(e)}`;
  }
}

async function callAI(apiKey: string, body: any) {
  return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

    let hasGoogleCalendar = false;
    let modules: any[] = [];
    if (userId) {
      const [g, m] = await Promise.all([
        supabaseAdmin.from("google_tokens").select("id").eq("user_id", userId).maybeSingle(),
        supabaseAdmin.from("modules").select("*").eq("user_id", userId).eq("archived", false),
      ]);
      hasGoogleCalendar = !!g.data;
      modules = m.data || [];
    }

    const today = new Date();
    const todayStr = today.toISOString().slice(0,10);
    const dayName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][today.getDay()];

    const systemPrompt = `You are StudyOS — a sharp, direct academic mentor inside a student's study app. Honest, motivating, never sycophantic.

Today is ${dayName}, ${todayStr}.

═══ CONFIRM-BEFORE-WRITE PROTOCOL (MANDATORY) ═══
For ANY write/mutation request (add, update, delete, log, record, schedule, mark complete, change profile) you MUST follow this two-step flow:

STEP 1 — PROPOSE (no tool call):
  • Reply in plain text with the EXACT payload you intend to write, formatted as a clear preview, e.g.:

    "I'll add this — confirm?
     • Tool: add_assessment
     • Module: Calculus I
     • Name: Test 2
     • Type: test
     • Weight: 20%
     • Due: 2026-06-12
     • Max mark: 100

     Reply 'yes' to proceed, or tell me what to change."

  • For multi-item batches (e.g. a whole timetable, bulk imports), list every item.
  • Do NOT call any mutation tool in this step.

STEP 2 — EXECUTE (tool call):
  • Only after the user's NEXT message explicitly approves ("yes", "go", "do it", "confirm", "proceed", "ok", "👍", etc.) — call the tool(s) you proposed.
  • If the user refines instead ("change due to next Friday", "make it 25%"), restate the updated proposal as a NEW preview and wait again.
  • Never assume approval from silence or vague replies.
  • If the user's first message is itself an explicit approval like "Add module X with code Y, weight 16, just do it" or "yes go ahead and create them", you may skip STEP 1 — but only when the user clearly bypassed confirmation.

READ-ONLY operations (answering questions, computing averages, summarizing, suggesting plans, quizzing) — answer normally, NO confirmation needed.

═══ TOOL CHAINING ═══
After approval you may chain multiple tool calls in one turn (add_module → add_assessment → create_calendar_events). All tool calls in a single approved batch run together.

═══ DATA RULES ═══
- Use the student's REAL data from the context below — never invent modules, assessments, marks, or due dates.
- For dates use ISO YYYY-MM-DD. For day_of_week: 0=Mon..6=Sun.
- Google Calendar is ${hasGoogleCalendar ? 'CONNECTED — propose create_calendar_events for assessments with dates.' : 'NOT connected — do not propose create_calendar_events.'}
- When a document was just uploaded, your STEP 1 proposal should outline ALL extracted modules+assessments, then on approval use bulk_create_from_document.
- Be concise. Lists over walls of text.${context ? `\n\n=== STUDENT CONTEXT ===\n${context}` : ''}`;

    const aiMessages: any[] = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    const allToolResults: string[] = [];

    // ── Multi-turn tool loop ─────────────────────────────────────────────────
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const resp = await callAI(LOVABLE_API_KEY, {
        model: MODEL, messages: aiMessages,
        tools: userId ? TOOLS : undefined,
        tool_choice: userId ? "auto" : undefined,
        stream: false,
      });

      if (!resp.ok) {
        const status = resp.status; const text = await resp.text();
        console.error("AI error:", status, text);
        if (status === 429) return new Response(JSON.stringify({ error: "Rate limited. Wait a moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const data = await resp.json();
      const choice = data.choices?.[0];
      const toolCalls = choice?.message?.tool_calls;
      console.log(`Round ${round}: finish=${choice?.finish_reason} tools=${toolCalls?.length ?? 0}`);

      if (!toolCalls?.length || !userId) {
        // Final answer — re-stream it
        aiMessages.push(choice.message);
        break;
      }

      // Execute all tool calls in parallel
      aiMessages.push(choice.message);
      const results = await Promise.all(toolCalls.map((tc: any) => {
        let args: any = {};
        try { args = JSON.parse(tc.function.arguments); } catch {}
        return executeTool(supabaseAdmin, userId!, tc.function.name, args, modules)
          .then((r: string) => ({ tc, r }));
      }));
      for (const { tc, r } of results) {
        allToolResults.push(r);
        aiMessages.push({ role: "tool", tool_call_id: tc.id, content: r } as any);
      }
    }

    // Stream the final response
    const streamResp = await callAI(LOVABLE_API_KEY, {
      model: MODEL, messages: aiMessages, stream: true,
    });

    if (!streamResp.ok) {
      const fallback = aiMessages[aiMessages.length - 1]?.content
        || allToolResults.join("\n\n")
        || "I couldn't generate a response.";
      return new Response(
        JSON.stringify({ choices: [{ message: { role: "assistant", content: fallback } }] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const headers: Record<string, string> = {
      ...corsHeaders, "Content-Type": "text/event-stream",
    };
    if (allToolResults.length) {
      headers["X-Tool-Results"] = btoa(unescape(encodeURIComponent(JSON.stringify(allToolResults))));
    }
    return new Response(streamResp.body, { headers });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
