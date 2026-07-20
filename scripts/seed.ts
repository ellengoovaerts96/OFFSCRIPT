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
        country,
        region,
        neighbourhood,
        categories,
        subcategories,
        short_description,
        practical_info,
        personal_tip,
        transport,
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
        'Senegal',
        'Mbour',
        'Mbour',
        ARRAY['culture'],
        ARRAY['market'],
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
        1,
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

  await pool.query(
    `
      WITH place AS (
        INSERT INTO places (
          name,
          country,
          region,
          neighbourhood,
          categories,
          short_description,
          practical_info,
          personal_tip,
          transport,
          best_for,
          not_ideal_for,
          traveller_types,
          child_friendly,
          child_notes,
          best_timing,
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
          'Village de Soumbédioune',
          'Senegal',
          'Dakar',
          'Soumbédioune',
          ARRAY['culture', 'shopping'],
          'A craft village in Dakar where visitors can browse local handmade goods.',
          'Useful for testing places with multiple shopping subcategories such as woodwork, jewellery, artworks and handbags.',
          'Take your time and compare a few stalls before buying.',
          'It brings many local crafts together in one walkable place.',
          ARRAY['craft shopping', 'local culture', 'souvenirs'],
          ARRAY['quiet no-shopping afternoons'],
          ARRAY['solo', 'couple', 'friends', 'family', 'group'],
          true,
          'Families can visit, but children should stay close around busy stalls.',
          ARRAY['morning', 'afternoon'],
          3,
          false,
          'not_possible',
          'https://www.google.com/maps/search/?api=1&query=Village%20de%20Soumb%C3%A9dioune%2C%20Dakar%2C%20Senegal',
          'A taxi is usually easiest; agree the price before leaving.',
          'Keep valuables close and negotiate prices calmly.',
          false,
          'development_seed',
          'OFFSCRIPT',
          CURRENT_DATE,
          'ready'
        )
        ON CONFLICT DO NOTHING
        RETURNING id
      ),
      existing_place AS (
        SELECT id FROM place
        UNION
        SELECT id FROM places WHERE name = 'Village de Soumbédioune'
      )
      INSERT INTO place_subcategories (place_id, name, display_order)
      SELECT existing_place.id, subcategory.name, subcategory.display_order
      FROM existing_place
      CROSS JOIN (
        VALUES
          ('wood', 1),
          ('jewellery', 2),
          ('artworks', 3),
          ('handbags', 4)
      ) AS subcategory(name, display_order)
      ON CONFLICT (place_id, name) DO NOTHING
    `
  );

  console.log("Seed completed: demo Mbour and Soumbédioune places are available.");
} finally {
  await pool.end();
}
