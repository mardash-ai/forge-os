# Forge starter — convenience commands. These ONLY delegate to Docker.
# No local Node, npm, or build tools are assumed.

.PHONY: up down logs shell ps restart pull new-app \
        deploy deploy-ps deploy-logs deploy-config deploy-down

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

# --- Production deployment (compose.prod.yaml) -----------------------------
# Runs on the DEPLOY host — the app + Forge data-plane sidecar + Postgres, no
# control plane. Pull-and-run (images are prebuilt by CI; nothing is built here).
# Prereqs: Docker, `docker login ghcr.io`, and a configured .env (see
# .env.prod.example and DEPLOY.md).
PROD := docker compose -f compose.prod.yaml

# One command to (re)deploy or update: pull the pinned images and roll the stack.
# Unchanged services stay up; changed ones are recreated. Safe to re-run.
deploy:
	$(PROD) pull
	$(PROD) up -d
	@$(PROD) ps
	@echo ""
	@echo "Deployed. Verify:  curl -sf http://localhost:$${WEB_PORT:-3000}/api/health"

deploy-ps:
	$(PROD) ps

deploy-logs:
	$(PROD) logs -f

# Validate compose.prod.yaml + the resolved .env without touching anything.
deploy-config:
	$(PROD) config

# Stop the stack but KEEP the data volumes (postgres_data, forge_state).
# (Never `down -v` in prod — that destroys the database.)
deploy-down:
	$(PROD) down
