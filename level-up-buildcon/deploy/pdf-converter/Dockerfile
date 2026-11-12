# ProjectDesk PDF service: Gotenberg (LibreOffice behind an HTTP API) with the same
# fonts LibreOffice uses on the office Mac, so the Agreement for Sale keeps its layout.
#
# Build:  docker build -t projectdesk-pdf deploy/pdf-converter
# Run:    docker run -p 3000:3000 -e GOTENBERG_API_BASIC_AUTH_USERNAME=... -e GOTENBERG_API_BASIC_AUTH_PASSWORD=... projectdesk-pdf
FROM gotenberg/gotenberg:8

USER root
# Carlito (metric-compatible with Calibri), Caladea, Liberation, Linux Libertine G, Frank Ruhl Hofshi.
# All are open licensed; copied from LibreOffice by prepare-fonts.sh.
COPY fonts/ /usr/local/share/fonts/projectdesk/
COPY fonts.conf /etc/fonts/conf.d/99-projectdesk.conf
RUN fc-cache -f
USER gotenberg

# PORT is set by Cloud Run / Render / Railway; Gotenberg listens on 3000 otherwise.
# Basic auth reads GOTENBERG_API_BASIC_AUTH_USERNAME and GOTENBERG_API_BASIC_AUTH_PASSWORD.
CMD ["gotenberg", "--api-port-from-env=PORT", "--api-timeout=120s", "--api-enable-basic-auth", "--chromium-disable-routes=true", "--libreoffice-auto-start=true"]
