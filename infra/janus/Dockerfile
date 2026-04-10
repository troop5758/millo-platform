# Janus WebRTC Gateway for Millo low-latency streaming
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    janus \
    curl \
    && rm -rf /var/lib/apt/lists/*

EXPOSE 8088 8089 8188 8189 10000-10200/udp

RUN mkdir -p /etc/janus
COPY janus.jcfg /etc/janus/janus.jcfg
COPY janus.plugin.streaming.jcfg /etc/janus/janus.plugin.streaming.jcfg

EXPOSE 8088 8089 8188 8189
CMD ["janus"]
