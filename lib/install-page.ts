export function renderInstallCommands(partsCount: number): string[] {
  const names = Array.from({ length: partsCount }, (_, index) => `parte${String(index + 1).padStart(2, "0")}`);
  const joined = names.join(" ");
  return [
    `cat ${joined} > yami-os-amd64.iso`,
    "sha256sum yami-os-amd64.iso",
  ];
}
