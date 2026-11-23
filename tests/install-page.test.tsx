import { describe, expect, it } from "vitest";
import { renderInstallCommands } from "../lib/install-page";

describe("página de instalação", () => {
  it("gera comandos para juntar as partes", () => {
    const commands = renderInstallCommands(2);
    expect(commands.join(" ")).toContain("cat parte01 parte02");
  });
});
