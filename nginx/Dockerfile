# Official nginx (HTTP/2 + HTTP/3/QUIC built in) + Google's Brotli module,
# compiled against the exact same nginx version as dynamic modules.
ARG NGINX_IMAGE=nginx:1.28-alpine

FROM ${NGINX_IMAGE} AS brotli
# Pin to a reviewed commit for reproducible builds if you prefer (git SHA).
ARG NGX_BROTLI_REF=master
RUN apk add --no-cache --virtual .build-deps \
      git gcc libc-dev make linux-headers openssl-dev pcre2-dev zlib-dev brotli-dev \
 && mkdir -p /usr/src && cd /usr/src \
 && wget -q "https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz" \
 && tar xzf "nginx-${NGINX_VERSION}.tar.gz" \
 && git clone --recurse-submodules --shallow-submodules https://github.com/google/ngx_brotli.git \
 && cd ngx_brotli && git checkout "${NGX_BROTLI_REF}" && git submodule update --init --depth 1 \
 && cd "/usr/src/nginx-${NGINX_VERSION}" \
 && ./configure --with-compat --add-dynamic-module=/usr/src/ngx_brotli \
 && make modules \
 && cp objs/ngx_http_brotli_filter_module.so objs/ngx_http_brotli_static_module.so /usr/lib/nginx/modules/

FROM ${NGINX_IMAGE}
# The modules link against the system Brotli library.
RUN apk add --no-cache brotli-libs
COPY --from=brotli /usr/lib/nginx/modules/ngx_http_brotli_filter_module.so /usr/lib/nginx/modules/
COPY --from=brotli /usr/lib/nginx/modules/ngx_http_brotli_static_module.so /usr/lib/nginx/modules/
COPY nginx.conf /etc/nginx/nginx.conf
COPY snippets/ /etc/nginx/snippets/
# The official entrypoint renders /etc/nginx/templates/*.template with envsubst
# (only DOMAIN, NGINX_SERVER_NAMES, NGINX_UPSTREAM — see NGINX_ENVSUBST_FILTER).
COPY pst.conf /etc/nginx/templates/pst.conf.template
COPY maintenance.html /usr/share/nginx/html/maintenance.html
COPY 90-reload-loop.sh /docker-entrypoint.d/90-reload-loop.sh
RUN rm -f /etc/nginx/conf.d/default.conf \
 && chmod 755 /docker-entrypoint.d/90-reload-loop.sh \
 && mkdir -p /var/log/nginx/pst /var/www/certbot
