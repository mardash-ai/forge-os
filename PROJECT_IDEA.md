# Sample Project Ideas for Forge

## The Role of the Sample Project

The sample project is not just a demo.

It is the wind tunnel for Forge.

Every new Forge capability should exist because the sample application
genuinely needs it---not because the architecture says it should.

This mirrors how successful platforms evolved:

-   Git was built to support Linux kernel development.
-   Kubernetes evolved to run Google's workloads.
-   Stripe built many internal platform capabilities to support real
    products.

The sample application should continuously pressure Forge to become a
better platform.

------------------------------------------------------------------------

# Design Constraints

A good sample project should:

1.  Be genuinely useful.
2.  Be open source.
3.  Be understandable by anyone.
4.  Have a rich domain model.
5.  Require both frontend and backend.
6.  Naturally exercise AI agents.
7.  Continue growing for years.
8.  Make sense as both a web and iOS application.

These constraints eliminate many common demo applications such as todo
lists, kanban boards, and chat apps because they become "finished" too
quickly.

------------------------------------------------------------------------

# The Litmus Test

Every week, Forge should need another capability because the application
encountered a real problem.

Not because the platform roadmap says another capability should exist.

------------------------------------------------------------------------

# Project Idea --- Forge OS

## A Personal Operating System

Think of Forge OS as:

> The system that helps you run your life.

Everything revolves around Goals.

The application's own domain model naturally mirrors Forge's:

Builder

↓

Goal

↓

Capabilities

↓

Resources

↓

Events

### Resources

-   Goal
-   Project
-   Task
-   Document
-   Meeting
-   Contact
-   Idea
-   Decision
-   Habit
-   Journal
-   Agent Task
-   Artifact
-   Notification
-   Timeline Event

### Capabilities

-   Plan
-   Prioritize
-   Schedule
-   Research
-   Write
-   Summarize
-   Review
-   Generate
-   Notify
-   Search
-   Organize

### Agents

-   Planner
-   Researcher
-   Writer
-   Scheduler
-   Meeting Assistant
-   Career Coach
-   Finance Assistant
-   Travel Planner

### Why it pressures Forge

Every feature naturally requires Forge capabilities:

-   Notifications → Events
-   Search → Indexing
-   Collaboration → Permissions
-   Background jobs → Workflow composition
-   AI → Agent framework
-   Offline support → Synchronization
-   Mobile → Shared resources
-   OAuth → Identity
-   Observability → Platform telemetry

Nothing feels artificial.