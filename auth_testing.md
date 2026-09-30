# Auth Testing Playbook (Engraved Word)

## Admin credentials
- admin@engravedword.com / Admin@123

## API tests
```
API=https://gather-video.preview.emergentagent.com
# register
curl -c c.txt -X POST $API/api/auth/register -H "Content-Type: application/json" \
  -d '{"name":"Host One","email":"host1@test.com","password":"pass123"}'
# login
curl -c c.txt -X POST $API/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@engravedword.com","password":"Admin@123"}'
# me (cookie)
curl -b c.txt $API/api/auth/me
# create meeting (cookie)
curl -b c.txt -X POST $API/api/meetings -H "Content-Type: application/json" -d '{"title":"Standup"}'
```

## Expectations
- register/login return { user, token } and set access_token cookie.
- /auth/me returns the user via cookie or Bearer token.
- Creating a meeting requires auth and returns a room code like "abc-def-ghi".
- GET /api/meetings/{code} is public.
