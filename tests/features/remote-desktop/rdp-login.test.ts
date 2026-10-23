import { rdpLogin } from "@/features/remote-desktop/rdp-login";

test("2.8 and 2.9 credential-less RDP hosts prompt, with their saved domain", () => {
  for (const host of [
    { rdpAuthType: "none", rdpDomain: "EXAMPLE" },
    {
      protocolAuth: {
        rdp: { authType: "none", fields: { domain: "EXAMPLE" } },
      },
    },
  ] as any[]) {
    expect(rdpLogin(host, "rdp").prompt).toBe(true);
    expect(rdpLogin(host, "rdp").domain).toBe("EXAMPLE");
    expect(rdpLogin(host, "vnc").prompt).toBe(false);
    expect(rdpLogin(host, "telnet").prompt).toBe(false);
  }
});

test("saved logins and personal overrides connect without a prompt", () => {
  for (const host of [
    {},
    { rdpAuthType: "direct" },
    { rdpAuthType: "credential" },
    { rdpAuthType: "none", protocolAuth: { rdp: { authType: "direct" } } },
    { rdpAuthType: "none", authOverrides: { rdp: { credentialId: 7 } } },
  ] as any[]) {
    expect(rdpLogin(host, "rdp").prompt).toBe(false);
  }
});

test("an explicitly empty modern domain overrides stale legacy fields", () => {
  expect(
    rdpLogin(
      {
        rdpDomain: "OLD",
        protocolAuth: { rdp: { fields: { domain: "" } } },
      } as any,
      "rdp",
    ).domain,
  ).toBe("");
});
