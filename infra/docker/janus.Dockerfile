# Janus WebRTC Gateway (SFU) — Millo Phase 2 / live pipeline.
# Context MUST be repository root:
#   docker build -f infra/docker/janus.Dockerfile -t millo/janus:latest .
#
# Debian bullseye source build → /opt/janus (matches janus.jcfg paths).

FROM debian:bullseye-slim AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git cmake pkg-config gengetopt libtool automake \
    libmicrohttpd-dev libjansson-dev libssl-dev \
    libsrtp2-dev libsofia-sip-ua-dev libglib2.0-dev \
    libopus-dev libogg-dev libcurl4-openssl-dev \
    liblua5.3-dev libconfig-dev \
    libnice-dev libwebsockets-dev \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch v1.2.4 https://github.com/meetecho/janus-gateway.git /janus-gateway

WORKDIR /janus-gateway

RUN sh autogen.sh && \
    ./configure --prefix=/opt/janus && \
    make -j"$(nproc)" && \
    make install

# --- Runtime image (no compiler toolchain) ---
FROM debian:bullseye-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    libmicrohttpd12 libjansson4 libssl1.1 libsrtp2-1 \
    libglib2.0-0 libopus0 libogg0 libcurl4 \
    liblua5.3-0 libconfig9 \
    libnice10 libwebsockets16 \
    libsofia-sip-ua0 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/janus /opt/janus

COPY infra/docker/janus/janus.jcfg /opt/janus/etc/janus/janus.jcfg
COPY infra/docker/janus/janus.plugin.streaming.jcfg /opt/janus/etc/janus/janus.plugin.streaming.jcfg

EXPOSE 8088 8089 8188 8189
EXPOSE 10000-10200/udp

CMD ["/opt/janus/bin/janus"]
