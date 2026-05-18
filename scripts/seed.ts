import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing. Add it to .env before seeding.");
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
});

try {
  await pool.query(
    `
      INSERT INTO places (
        name,
        region,
        neighbourhood,
        category,
        subcategory,
        short_description,
        long_description,
        personal_tip,
        why_hidden_gem,
        best_for,
        not_ideal_for,
        traveller_types,
        child_friendly,
        child_notes,
        best_timing,
        opening_hours,
        price_level,
        reservation_needed,
        reservation_method,
        google_maps_url,
        transport_notes,
        safety_notes,
        guide_available,
        source,
        verified_by,
        last_verified_at,
        status
      )
      VALUES (
        'OFFSCRIPT Demo: Mbour Fish Market',
        'Mbour',
        'Mbour',
        'culture',
        'market',
        'A demo record for testing OFFSCRIPT recommendations in Mbour.',
        'Use this as development content only until the place is editorially verified.',
        'Go earlier in the day if you want the market energy without the hottest afternoon hours.',
        'It helps test a local, practical recommendation flow outside Dakar.',
        ARRAY['local atmosphere', 'markets', 'coastal culture'],
        ARRAY['quiet romantic dinners'],
        ARRAY['solo', 'couple', 'friends', 'family', 'group'],
        true,
        'Families should keep children close because markets can be busy.',
        ARRAY['morning', 'afternoon'],
        'Verify locally before recommending exact hours.',
        'low',
        false,
        'not_possible',
        'https://www.google.com/maps/search/?api=1&query=Mbour%20Fish%20Market%2C%20Mbour%2C%20Senegal',
        'Take a local taxi and agree the price before leaving.',
        'Keep valuables close in crowded areas.',
        false,
        'development_seed',
        'OFFSCRIPT',
        CURRENT_DATE,
        'ready'
      )
      ON CONFLICT DO NOTHING
    `
  );

  console.log("Seed completed: demo Mbour place is available.");
} finally {
  await pool.end();
}
