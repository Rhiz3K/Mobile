import {
  findStartupSnippet,
  shellQuote,
  startupLines,
} from "@/features/terminal/startup";

const host = { ip: "10.0.0.5", username: "deploy", port: 22, name: "web" };

test("quotes values for any shell", () => {
  expect(shellQuote("a b")).toBe("'a b'");
  expect(shellQuote("it's")).toBe(String.raw`'it'\''s'`);
});

test("a relay shell gets export lines, a phone shell does not", () => {
  const sshOptions = {
    environmentVariables: [
      { key: "EDITOR", value: "vim" },
      { key: "bad name", value: "x" },
    ],
  };
  expect(startupLines({ transport: "relay", sshOptions, host })).toEqual([
    "export EDITOR='vim'",
  ]);
  expect(startupLines({ transport: "local", sshOptions, host })).toEqual([]);
});

test("2.9 options win over a 2.8 terminalConfig variable of the same name", () => {
  expect(
    startupLines({
      transport: "relay",
      legacyEnv: [{ key: "LANG", value: "C" }],
      sshOptions: { environmentVariables: [{ key: "LANG", value: "en" }] },
      host,
    }),
  ).toEqual(["export LANG='en'"]);
});

test("the startup snippet fills host variables and runs before mosh and attach", () => {
  expect(
    startupLines({
      transport: "local",
      snippet: { content: "echo $USER@$HOST:${PORT}" },
      mosh: "mosh-server new",
      attach: "tmux new-session -A -s x",
      host,
    }),
  ).toEqual([
    "echo deploy@10.0.0.5:22",
    "mosh-server new",
    "tmux new-session -A -s x",
  ]);
});

test("a startup snippet that asks for input is skipped", () => {
  expect(
    startupLines({
      transport: "local",
      snippet: { content: "ssh $INPUT_1" },
      host,
    }),
  ).toEqual([]);
});

test("finds the snippet by server id or by syncId", () => {
  const list = [
    { id: 1, syncId: "a" },
    { id: 2, syncId: "b" },
  ];
  expect(findStartupSnippet(list, 2)?.syncId).toBe("b");
  expect(findStartupSnippet(list, "a")?.id).toBe(1);
  expect(findStartupSnippet(list, "zz")).toBeNull();
  expect(findStartupSnippet(list, null)).toBeNull();
});
