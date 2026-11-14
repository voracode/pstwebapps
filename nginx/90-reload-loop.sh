#!/bin/sh
# Reload nginx every 6 hours so certificates renewed by the certbot container
# are picked up without downtime. Runs in the background next to nginx.
(
  while :; do
    sleep 21600
    nginx -t -q && nginx -s reload
  done
) &
