# Forge starter — convenience commands. These ONLY delegate to Docker.
# No local Node, npm, or build tools are assumed.

.PHONY: up down logs shell ps restart pull new-app

up:
	docker compose up -d
	@echo ""
	@echo "Forge is up. Provision a whole app in one command:"
	@echo "  ./new-app my-app                 # init->provision->install->build->test->lint"
	@echo "Or step by step: ./forge init app --name my-app  (then provision/install/build/…)"
	@echo "Or just tell Claude: \"build me a <thing>\" (see .claude/skills/provision-app)."

# One command to scaffold + validate a new app:  make new-app name=my-app
new-app:
	@test -n "$(name)" || (echo "usage: make new-app name=<kebab-name>"; exit 2)
	./new-app "$(name)"

down:
	docker compose down

logs:
	docker compose logs -f api

shell:
	docker compose exec api sh

ps:
	docker compose ps

restart:
	docker compose restart api

# Refresh the platform image from the registry.
pull:
	docker compose pull
