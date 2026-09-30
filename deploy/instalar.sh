#!/usr/bin/env bash
# Instala ecko en un servidor Ubuntu 24.04 limpio (por ejemplo un VPS de Hostinger).
# Uso, como root:
#   curl -fsSL https://raw.githubusercontent.com/bautistafailooo/Ticketera/refs/heads/claude/ticketera-primeros-pasos-lgk7de/deploy/instalar.sh | bash
set -euo pipefail

REPO="${REPO:-https://github.com/bautistafailooo/Ticketera.git}"
BRANCH="${BRANCH:-claude/ticketera-primeros-pasos-lgk7de}"
DIR="${DIR:-/opt/ecko}"

paso() { printf '\n\033[1;35m==> %s\033[0m\n' "$1"; }
preguntar() { # preguntar "Texto" "valor por defecto" → devuelve la respuesta
  local respuesta
  read -r -p "$1 [$2]: " respuesta < /dev/tty || true
  echo "${respuesta:-$2}"
}

if [[ $EUID -ne 0 ]]; then
  echo "Corré este script como root (o con sudo)." >&2
  exit 1
fi

paso "Actualizando el sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq git curl ufw fail2ban unattended-upgrades

paso "Activando actualizaciones de seguridad automáticas"
dpkg-reconfigure -f noninteractive unattended-upgrades

paso "Instalando Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

paso "Configurando el firewall (solo SSH, http y https)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

paso "Descargando ecko"
if [[ -d "$DIR/.git" ]]; then
  git -C "$DIR" fetch -q origin "$BRANCH"
  git -C "$DIR" checkout -q "$BRANCH"
  git -C "$DIR" pull -q --ff-only origin "$BRANCH"
else
  git clone -q --branch "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR"
mkdir -p data

if [[ ! -f .env.production ]]; then
  paso "Configuración"
  IP="$(curl -4fsS https://api.ipify.org || hostname -I | awk '{print $1}')"
  DOMINIO_GRATIS="${IP//./-}.sslip.io"
  echo "Si todavía no tenés dominio, dejá el que aparece: es una dirección gratuita que apunta a este servidor y tiene https."
  DOMAIN="$(preguntar "Dominio del sitio" "$DOMINIO_GRATIS")"
  ADMIN_EMAIL="$(preguntar "Tu email (la cuenta de administrador)" "")"
  CLAVE_SUGERIDA="$(tr -dc 'a-z0-9' < /dev/urandom | head -c 12)"
  SITE_PASSWORD="$(preguntar "Contraseña para entrar al sitio mientras es privado" "$CLAVE_SUGERIDA")"
  SMTP_URL="$(preguntar "SMTP_URL para mandar mails (Enter para dejarlo para después)" "")"
  MAIL_FROM="$(preguntar "Remitente de los mails" "ecko <onboarding@resend.dev>")"

  echo "DOMAIN=$DOMAIN" > .env
  cat > .env.production <<EOF
NODE_ENV=production
PUBLIC_URL=https://$DOMAIN
ADMIN_EMAIL=$ADMIN_EMAIL
SITE_PASSWORD=$SITE_PASSWORD
# Compras sin cobrar mientras no está Mercado Pago. Sacarla antes del lanzamiento.
SIMULATED_PAYMENTS=true
SMTP_URL=$SMTP_URL
MAIL_FROM=$MAIL_FROM
EOF
  chmod 600 .env .env.production
else
  echo "Ya hay una configuración en $DIR/.env.production: se mantiene."
  DOMAIN="$(grep '^DOMAIN=' .env | cut -d= -f2)"
  SITE_PASSWORD="$(grep '^SITE_PASSWORD=' .env.production | cut -d= -f2)"
fi

paso "Construyendo y arrancando ecko (tarda unos minutos la primera vez)"
docker compose up -d --build

paso "Esperando a que el sitio responda con https"
for _ in $(seq 1 60); do
  if curl -fsS "https://$DOMAIN/health" >/dev/null 2>&1; then
    LISTO=1
    break
  fi
  sleep 5
done

echo
if [[ "${LISTO:-}" == 1 ]]; then
  printf '\033[1;32m¡ecko está online!\033[0m\n'
else
  printf '\033[1;33mecko arrancó, pero el https todavía no responde. Esperá un par de minutos.\033[0m\n'
  echo "Para ver qué pasa: cd $DIR && docker compose logs --tail 50"
fi
cat <<EOF

  Dirección:            https://$DOMAIN
  Contraseña del sitio: $SITE_PASSWORD  (el usuario puede ser cualquiera)

Próximos pasos:
  1. Entrá, andá a Organizadores → Crear cuenta con tu email de administrador.
  2. Volvé acá y corré:  cd $DIR && docker compose restart app
     Al reiniciar, tu cuenta pasa a ser administrador.

Para actualizar ecko cuando haya cambios:  bash $DIR/deploy/actualizar.sh
EOF
