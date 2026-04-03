import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { file_path, file_name, file_type, module_name, mode } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Get user
    const authHeader = req.headers.get("authorization");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabaseAdmin
      .storage
      .from("study-files")
      .download(file_path);
    
    if (downloadError) throw new Error(`Download failed: ${downloadError.message}`);

    let extractedText = "";
    const isImage = file_type?.startsWith("image/");
    
    if (isImage) {
      // Use AI vision to extract text from image
      const base64 = btoa(String.fromCharCode(...new Uint8Array(await fileData.arrayBuffer())));
      const mimeType = file_type || "image/jpeg";
      
      const visionResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Extract ALL text from this image. If it's a document, transcript, or study material, preserve the structure including dates, weights, percentages, and any tabular data. Return only the extracted text, no commentary." },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
              ],
            },
          ],
        }),
      });

      if (visionResponse.ok) {
        const visionData = await visionResponse.json();
        extractedText = visionData.choices?.[0]?.message?.content || "";
      }
    } else {
      extractedText = await fileData.text();
    }

    // Detect document type and do smart analysis
    let analysis = null;
    let structured_data = null;

    if (extractedText.length > 50) {
      // First, detect document type
      const detectResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: "You classify academic documents. Return JSON only.",
            },
            {
              role: "user",
              content: `Classify this document and extract structured academic data. Return JSON with this structure:
{
  "document_type": "transcript" | "course_outline" | "study_guide" | "lecture_notes" | "past_paper" | "assignment" | "other",
  "confidence": 0.0-1.0,
  "modules_found": [
    {
      "name": "Module Full Name",
      "code": "MOD101",
      "credit_weight": 16,
      "semester": "Semester 1 2024"
    }
  ],
  "assessments_found": [
    {
      "name": "Test 1",
      "type": "test|assignment|exam|practical|project",
      "weight_percent": 40,
      "due_date": "2026-04-15 or null if not found",
      "mark_achieved": null,
      "max_mark": 100,
      "module_name": "Which module this belongs to"
    }
  ],
  "key_dates": [
    {
      "date": "2026-04-15",
      "description": "Test 1 - Module Name",
      "type": "assessment|lecture|exam|deadline"
    }
  ],
  "key_concepts": ["concept1", "concept2"],
  "study_approach": "Suggested approach for this material",
  "quiz_questions": [{"question": "...", "answer": "..."}]
}

Rules:
- Extract EVERY assessment, test, exam, assignment with dates and weights if visible
- For course outlines, extract the full assessment schedule with due dates and weightings
- For transcripts, extract marks achieved
- For study guides/notes, focus on key concepts and quiz questions
- If weight is not shown, estimate from context
- Dates should be in YYYY-MM-DD format
- Always include quiz_questions (at least 3-5)

Document text:
${extractedText.substring(0, 50000)}`,
            },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (detectResponse.ok) {
        const detectData = await detectResponse.json();
        try {
          const parsed = JSON.parse(detectData.choices?.[0]?.message?.content || "null");
          if (parsed) {
            structured_data = parsed;
            analysis = {
              document_type: parsed.document_type,
              key_concepts: parsed.key_concepts || [],
              study_approach: parsed.study_approach || "",
              quiz_questions: parsed.quiz_questions || [],
              modules_found: parsed.modules_found || [],
              assessments_found: parsed.assessments_found || [],
              key_dates: parsed.key_dates || [],
            };
          }
        } catch {
          analysis = null;
        }
      }
    }

    return new Response(
      JSON.stringify({ extracted_text: extractedText, analysis, structured_data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("extract-text error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
