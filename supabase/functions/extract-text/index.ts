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
    const { file_path, file_name, file_type, module_name } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Get user
    const authHeader = req.headers.get("authorization");
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
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
                { type: "text", text: "Extract ALL text from this image. If it's a document, transcript, or study material, preserve the structure. Return only the extracted text, no commentary." },
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
      // For text-based files, read as text
      extractedText = await fileData.text();
    }

    // Now analyze the content with AI
    let analysis = null;
    if (extractedText.length > 50) {
      const analysisResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
              content: "You analyze academic study materials. Return JSON only.",
            },
            {
              role: "user",
              content: `This is study material${module_name ? ` for ${module_name}` : ""}. Analyze it and return JSON with: {"key_concepts": ["concept1", ...], "study_approach": "suggested approach", "quiz_questions": [{"question": "...", "answer": "..."}]}. Include exactly 5 key concepts and 5 quiz questions.\n\nMaterial:\n${extractedText.substring(0, 30000)}`,
            },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (analysisResponse.ok) {
        const analysisData = await analysisResponse.json();
        try {
          analysis = JSON.parse(analysisData.choices?.[0]?.message?.content || "null");
        } catch {
          analysis = null;
        }
      }
    }

    return new Response(
      JSON.stringify({ extracted_text: extractedText, analysis }),
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
