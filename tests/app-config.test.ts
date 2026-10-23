const config = require("../app.json").expo;

test("Android never backs up app data", () => {
  expect(config.android.allowBackup).toBe(false);
});

test("the local database is built with SQLCipher", () => {
  const sqlite = config.plugins.find(
    (p: unknown) => Array.isArray(p) && p[0] === "expo-sqlite",
  );
  expect(sqlite?.[1]).toEqual({ useSQLCipher: true });
});
