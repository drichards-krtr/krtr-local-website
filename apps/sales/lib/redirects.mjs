// Only known application destinations are accepted from authentication URLs.
export function authDestination(value) {
  return value === "/update-password" ? value : "/dashboard";
}
