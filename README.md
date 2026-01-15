# AI Kanban Board

An AI-powered Kanban board that orchestrates multiple AI agents to autonomously work on tasks. Think of it as an AI project manager that can plan, distribute, execute, review, and approve work across parallel workers.

## What This Project Does

This application provides a visual Kanban interface where you can:

- **Create Projects & Tasks** - Define work items that AI agents will autonomously complete
- **Multi-Stage AI Pipeline** - Tasks flow through distinct stages: Summarize → Plan → Distribute → Select → Work → Review → Approval
- **Parallel AI Workers** - Multiple AI agents can work on different tasks simultaneously with file locking to prevent conflicts
- **Human-in-the-Loop Gates** - Configure approval checkpoints where humans must approve before work continues
- **Context Management** - Automatic context summarization to keep AI agents focused within token limits
- **MCP Integration** - Model Context Protocol servers provide AI agents with filesystem, terminal, and other tool capabilities

## Getting Started

### Prerequisites

- **Python 3.10+** - Will be auto-installed via winget if missing
- **Node.js 18+** - Will be auto-installed via winget if missing
- **Windows** - Currently optimized for Windows with PowerShell

### Quick Start

1. Open PowerShell in the project directory
2. Run the startup script:

```powershell
.\start.ps1
```

This script will automatically:
- Create a Python virtual environment
- Install all Python dependencies
- Install all npm packages
- Start the MCP backend server
- Start the React frontend dev server

3. Open your browser to `http://localhost:5173`

## Settings (⚙️ Gear Icon)

Click the settings gear icon in the top-right corner to configure the application. Settings are organized into tabs:

### Workers Tab
| Setting | Description |
|---------|-------------|
| **Worker Count** | Number of parallel AI workers (1-10). More workers = more tasks processed simultaneously |
| **Lock Timeout** | How long (in seconds) a file lock can be held before timing out (30-600s) |
| **Max Turn Count** | Maximum AI conversation turns before requiring human approval |
| **Context Summarize Threshold** | When context usage hits this % (50-95%), the system summarizes to free up space |

### Auto-Save Tab
| Setting | Description |
|---------|-------------|
| **Enable Auto-Save** | Toggle automatic saving of tasks |
| **Save Interval** | How often to auto-save tasks (5-300 seconds) |
| **Save File Path** | Where task data is persisted |

### Planning Tab
| Setting | Description |
|---------|-------------|
| **Auto Approve** | Skip human approval gates for planning stage |
| **Default Planning Files** | Markdown instruction files used during the planning phase |

### Review Tab
| Setting | Description |
|---------|-------------|
| **Default Review Files** | Markdown instruction files guiding code review, architecture review, and security review |

### Other Tab
| Setting | Description |
|---------|-------------|
| **Other Instructions** | Additional instruction files for stages like summarize, select, distribute, work, and approval |

### Stage Models Tab
Configure which AI provider and model to use for each pipeline stage:
- **Provider**: `openai`, `anthropic`, or other supported providers
- **Model**: The specific model (e.g., `gpt-4o-mini`, `claude-3-sonnet`)
- **API Key**: Your API key for the provider
- **Max Context Tokens**: Token limit for the model's context window

Each stage (Create, Summarize, Plan, Distribute, Select, Work, Review, Approval) can use different models, allowing you to optimize cost vs. capability per stage.

## Configuration File

Advanced settings can be edited directly in `config/settings.json`. See `config/settings.example.json` for the full schema.

## Project Structure

```
├── backend/          # Python MCP server
├── src/              # React frontend
│   ├── components/   # UI components (Kanban, Modals, etc.)
│   └── core/         # Business logic (TaskController, AIClient, etc.)
├── config/           # Settings files
├── plan/             # Planning stage instruction files
├── review/           # Review stage instruction files
├── work/             # Work stage instruction files
└── approval/         # Approval stage instruction files
```

## License

MIT
