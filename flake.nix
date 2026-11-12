{
  description = "dashboard-infra — abonnements IA et consommation Prometheus";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
  };

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          # Keep @playwright/test pinned to the driver version shipped by this
          # nixpkgs revision (see package.json). Chromium revision 1217 matches
          # Playwright 1.59.1.
          browsers = pkgs.playwright-driver.browsers;
        in
        {
          default = pkgs.mkShell {
            name = "dashboard-infra";
            packages = [
              pkgs.nodejs_24
              pkgs.git
              browsers
            ];
            PLAYWRIGHT_BROWSERS_PATH = "${browsers}";
            PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
            PLAYWRIGHT_VERSION = pkgs.playwright-driver.version;
            shellHook = ''
              export PLAYWRIGHT_BROWSERS_PATH="${browsers}"
              export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
              echo "dashboard-infra · Node $(node --version) · Playwright ${pkgs.playwright-driver.version}"
              echo "  npm ci"
              echo "  npm run dev:mock          # app + mock Prometheus"
              echo "  npm run check             # format, lint, types, unit, build"
              echo "  npm run test:e2e          # Playwright + axe"
            '';
          };
        }
      );

      formatter = forAllSystems (system: nixpkgs.legacyPackages.${system}.nixfmt-rfc-style);
    };
}
