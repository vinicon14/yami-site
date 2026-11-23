/**
 * Teclas mais comuns do menu de boot. A tecla muda de um modelo para outro;
 * a primeira tela do computador costuma mostrar a certa.
 */
export const BOOT_MENU_KEYS = [
  {
    brand: "Dell",
    key: "F12",
    note: "Se a tecla não responder, segure Fn e aperte F12.",
  },
  {
    brand: "HP",
    key: "Esc, depois F9",
    note: "Esc abre um menu. Escolha o dispositivo de boot, ou aperte F9 direto.",
  },
  {
    brand: "Lenovo",
    key: "F12",
    note: "Em IdeaPad e Yoga, tente Fn+F12. Também existe o botão Novo, um furinho perto da energia.",
  },
  {
    brand: "Acer",
    key: "F12",
    note: "Em vários modelos o F12 só funciona depois de ligar a opção F12 Boot Menu na configuração, que abre com F2.",
  },
  {
    brand: "Asus",
    key: "Esc ou F8",
    note: "Esc é comum em notebooks. F8 é comum em desktops.",
  },
  {
    brand: "Samsung",
    key: "F10, Esc ou F2",
    note: "Muda conforme o modelo. A primeira tela costuma mostrar a tecla.",
  },
  {
    brand: "Positivo",
    key: "F11",
    note: "Em alguns modelos também funciona F7. A configuração abre com F2 ou Del.",
  },
  {
    brand: "MSI",
    key: "F11",
    note: "A configuração da placa costuma abrir com Del.",
  },
  {
    brand: "Gigabyte",
    key: "F12",
    note: "A configuração da placa costuma abrir com Del.",
  },
  {
    brand: "ASRock",
    key: "F11",
    note: "A configuração da placa costuma abrir com F2 ou Del.",
  },
] as const;
