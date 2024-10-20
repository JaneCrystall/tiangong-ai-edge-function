FROM --platform=linux/arm64 supabase/edge-runtime:v1.58.12

COPY ./supabase/functions/_shared /home/deno/functions/_shared
COPY ./supabase/functions/main /home/deno/functions/main

CMD [ "start", "--main-service", "/home/deno/functions/main" ]