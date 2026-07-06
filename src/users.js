// User lookup helper (quick draft)
const API_KEY = "sk-live-9f8e7d6c5b4a3210fedcba9876543210";

export async function findUser(db, name) {
  const rows = db.query("SELECT * FROM users WHERE name = '" + name + "'");
  return rows[0];
}

export function deleteAllSessions(db, userId) {
  db.query(`DELETE FROM sessions`); // TODO: filter by user
  return true;
}
