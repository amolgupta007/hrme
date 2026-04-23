// Script: upload employee avatars to Supabase Storage and update avatar_url
// Run: node scripts/upload-employee-avatars.mjs

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = "https://imjwqktxzahhnfmfbtfc.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imltandxa3R4emFoaG5mbWZidGZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDMzMTY3NiwiZXhwIjoyMDg5OTA3Njc2fQ.XNoi59Rd8qy-ZZ8Gzv79b1NUQdzzBmgn1PeLzaHqqXw";
const PICS_DIR = path.join(__dirname, "../sample-documents/pics");
const BUCKET = "avatars";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // 1. Ensure the bucket exists (public)
  const { data: buckets } = await supabase.storage.listBuckets();
  const bucketExists = (buckets ?? []).some((b) => b.name === BUCKET);
  if (!bucketExists) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
    if (error) {
      console.error("Failed to create bucket:", error.message);
      process.exit(1);
    }
    console.log(`Created bucket: ${BUCKET}`);
  } else {
    console.log(`Bucket "${BUCKET}" already exists`);
  }

  // 2. Get the test1 org
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("slug", "test1")
    .single();

  if (orgError || !org) {
    console.error("Could not find test1 org:", orgError?.message);
    process.exit(1);
  }
  console.log(`Found org: ${org.name} (${org.id})`);

  // 3. Get employees excluding Amol Gupta
  const { data: employees, error: empError } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .eq("org_id", org.id)
    .not("first_name", "ilike", "%amol%")
    .order("first_name");

  if (empError || !employees?.length) {
    console.error("Could not fetch employees:", empError?.message);
    process.exit(1);
  }
  console.log(`Found ${employees.length} employees to update`);

  // 4. Get image files
  const images = fs
    .readdirSync(PICS_DIR)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .sort();

  if (images.length < employees.length) {
    console.warn(`Only ${images.length} images for ${employees.length} employees — some won't get photos`);
  }

  // 5. Upload each image and update the employee
  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const imgFile = images[i % images.length];
    const imgPath = path.join(PICS_DIR, imgFile);
    const ext = path.extname(imgFile).toLowerCase();
    const storagePath = `${org.id}/${emp.id}${ext}`;

    const fileBuffer = fs.readFileSync(imgPath);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: ext === ".png" ? "image/png" : "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error(`  ✗ Upload failed for ${emp.first_name} ${emp.last_name}:`, uploadError.message);
      continue;
    }

    const { data: publicUrlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);

    const avatarUrl = publicUrlData.publicUrl;

    const { error: updateError } = await supabase
      .from("employees")
      .update({ avatar_url: avatarUrl })
      .eq("id", emp.id);

    if (updateError) {
      console.error(`  ✗ DB update failed for ${emp.first_name} ${emp.last_name}:`, updateError.message);
    } else {
      console.log(`  ✓ ${emp.first_name} ${emp.last_name} → ${avatarUrl}`);
    }
  }

  console.log("\nDone!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
