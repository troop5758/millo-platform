# Locust example — HTTP load against Millo API.
# https://milloapp.com
#
# Usage: locust -f infra/loadtest/locustfile.example.py --host http://127.0.0.1:3000
#        (use staging / api.milloapp.com only when intentional)
# Web UI: http://localhost:8089 — set users/spawn rate for ~10k viewers equivalent (use workers: locust -f ... --master / --worker)

from locust import HttpUser, task, between


class MilloViewer(HttpUser):
    wait_time = between(0.5, 2)

    @task(3)
    def health(self):
        self.client.get("/health", name="/health")

    @task(1)
    def feed_placeholder(self):
        # Replace with a real public or token-authenticated path when ready.
        self.client.get("/health", name="/feed_placeholder")
