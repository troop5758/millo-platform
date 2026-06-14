const API = "/api";

export async function request(path, options = {}) {
  const token = localStorage.getItem("token");

  const res = await fetch(API + path, {
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` })
    },
    ...options
  });

  return res.json();
}
