# Tiny static host for sideloadable Android APKs, deployed on Dokploy.
#
# Serves a landing page at /  and a browsable list of builds under /apks/.
# The APK files themselves live in a bind-mounted volume (/data/apks) that the
# mobile build workflow scp's into — so they survive image redeploys.
#
# TLS is terminated by Dokploy's Traefik in front of this container, so we only
# listen on plain HTTP :80 here.
FROM nginx:1.27-alpine

# Correct APK mime type + autoindex for /apks (see nginx.conf).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Baked landing page. The APK binaries come from the mounted volume, not here.
COPY html/ /usr/share/nginx/html/

EXPOSE 80
