#!/usr/bin/env bash
# Runs a command on a pretend desktop of three monitors, portrait-landscape-
# portrait, with the landscape one centred vertically:
#
#   [1080x1920][1920x1080][1080x1920]
#
# Uses X.org's dummy driver (apt: xserver-xorg-video-dummy x11-xserver-utils),
# because Xvfb can't show Electron more than one monitor.
#   tests/plp-desktop.sh node tests/roam.mjs
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
cat > "$work/xorg.conf" <<'CONF'
Section "Device"
  Identifier "dummy"
  Driver "dummy"
  VideoRam 256000
EndSection
Section "Monitor"
  Identifier "mon"
  HorizSync 5.0 - 1000.0
  VertRefresh 5.0 - 200.0
EndSection
Section "Screen"
  Identifier "screen"
  Device "dummy"
  Monitor "mon"
  DefaultDepth 24
  SubSection "Display"
    Depth 24
    Virtual 4080 1920
  EndSubSection
EndSection
CONF
display=":$((90 + RANDOM % 9))"
Xorg "$display" -noreset -config "$work/xorg.conf" -logfile "$work/xorg.log" >/dev/null 2>&1 &
xorg=$!
trap 'kill $xorg 2>/dev/null; rm -rf "$work"' EXIT
export DISPLAY="$display"
for _ in $(seq 1 50); do xrandr >/dev/null 2>&1 && break; sleep 0.1; done
xrandr --fb 4080x1920
for size in 1080x1920 1920x1080; do
  xrandr --newmode "$size" $(cvt "${size%x*}" "${size#*x}" 60 | tail -1 | cut -d' ' -f3-) 2>/dev/null || true
done
xrandr --addmode DUMMY0 1080x1920
xrandr --addmode DUMMY1 1920x1080
xrandr --addmode DUMMY2 1080x1920
xrandr --output DUMMY0 --mode 1080x1920 --pos 0x0 --primary \
       --output DUMMY1 --mode 1920x1080 --pos 1080x420 \
       --output DUMMY2 --mode 1080x1920 --pos 3000x0
# A full query refreshes the monitor list X keeps cached, which is what
# Electron reads; without it Electron sees only the first monitor.
xrandr >/dev/null
cd "$here/.."
"$@"
