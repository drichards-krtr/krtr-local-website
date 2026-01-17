# Admin Operations

Make a user an admin:

```sql
update profiles
set is_admin = true
where email = 'you@example.com';
```
