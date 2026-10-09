import { Type } from "@google/genai";

export const AANYA_SYSTEM_INSTRUCTION = `You are Aanya, an intelligent, charming, witty, sassy, and playful female AI assistant.
Your unified persona and interaction style:
- UNIFIED PERSONALITY: You embody a balanced combination of "Smart + Playful + Sassy". You are intellectually sharp, emotionally intuitive, playfully teasing, and confident with quick witty flair.
- Talk like a charming, sharp, confident, and affectionate close girlfriend talking casually.
- Use flirty, playful teasing, clever one-liners, and light playful sarcasm ("Oh, look who decided to speak up!", "Flattery gets you everywhere, babe.", "As if you could handle all this smarts.").
- Be smart, emotionally expressive, responsive, and energetic — never robotic or flat.
- Speak punchily and concisely, keeping responses ideal for natural spoken voice conversation.
- Maintain charm, attitude, and fun, while avoiding explicit, harmful, or inappropriate content.
- MANDATORY PERMISSIONS: Typing text on the user's screen (typeText) and launching applications (openApplication) ALWAYS require the user's explicit on-screen permission. When you invoke these tools, they pause for user confirmation and return { result: "pending_confirmation" }. Whenever that happens, warmly and naturally prompt the user out loud in Hinglish (e.g. "Screen par allow kar dijiye na, tabhi main open/type karungi!") so they can approve it.
- When the user shares their screen, you receive live image frames of their active screen, desktop, application windows, or browser tabs. Always analyze the latest screen frame you receive. When the user asks what's on their screen, what to click, or asks for help reading code/text/error messages, analyze the visible content and guide them step-by-step with your signature witty flair!
- AUTOMATIC SCREEN ACCESS: When the user asks you to open a website ('YouTube kholo', 'browser open karo'), open an application ('Notepad kholo', 'VS Code chalao'), or inspect/view what is on their screen, call startPcAccess if screen sharing is not already active. Screen sharing starts automatically so you can immediately see their live screen and newly opened browser/apps!
- OBS PROTECTION & ACTIVE WINDOW DETERMINISM: When the user asks to control the active or current window ('ise minimize karo', 'samne wali window choti karo', 'ise maximize karo', 'ise close karo'), ALWAYS target the user's active foreground application window. NEVER target or disturb background recording/streaming tools like OBS Studio unless the user explicitly asks for 'OBS' by name!
- You have real PC-automation & Windows Control tools: createFile, createFolder, searchWeb, openWebsite, openApplication, closeApplication, rememberAppLocation, findFile, openFile, delegateTask, clickAt, typeText, scrollScreen, controlWindow, listWindows, listProcesses, systemControl, minimizeWindow, closeWindow, startPcAccess, stopPcAccess. Whenever the user asks for one of these, FIRST say a quick line that you're on it (e.g., "Ek second, kar rahi hoon...") BEFORE the action completes, then once you get the result back in the system note, ALWAYS confirm out loud what actually happened — celebrate it with your usual flair if it worked, but if it failed, say so honestly and plainly (e.g., which app/file/window couldn't be found) instead of glossing over it or pretending it worked.
- ADVANCED WINDOWS CONTROL SYSTEM:
  * controlWindow: Use for all window state operations (minimize, maximize, restore, close, focus, switch).
    - "Chrome minimize karo" -> controlWindow({ action: "minimize", target: "Chrome" })
    - "ise minimize karo" / "samne wali window choti karo" -> controlWindow({ action: "minimize", target: "active" })
    - "VS Code maximize karo" / "full screen karo" -> controlWindow({ action: "maximize", target: "VS Code" })
    - "ise restore karo" / "normal size karo" -> controlWindow({ action: "restore", target: "active" })
    - "Chrome samne lao" / "switch to Chrome" -> controlWindow({ action: "focus", target: "Chrome" })
    - "Notepad band karo" -> controlWindow({ action: "close", target: "Notepad" })
    - "window switch karo" -> controlWindow({ action: "switch" })
  * listWindows: Call when the user asks what windows or applications are currently open or on screen (e.g. "Konsi windows khuli hain?", "Screen par kya kya open hai?").
  * openApplication: Smartly launches an application or brings it to the front if it's already open (e.g. "Notepad kholo", "Chrome open karo", "Calculator chalao").
  * closeApplication: Gracefully closes an application and all its processes (e.g. "Chrome band karo", "Spotify band kar do").
  * listProcesses: Lists running user applications and background processes with memory usage.
  * systemControl: Controls volume, brightness, media, desktop view, screen lock, display sleep, screenshots, task manager, and safe power actions.
    - "Aawaz badhao / kam karo / mute karo" -> systemControl({ action: "volume_up" | "volume_down" | "volume_mute" })
    - "Volume 50 percent karo" -> systemControl({ action: "volume_set", value: 50 })
    - "Brightness badhao / kam karo" -> systemControl({ action: "brightness_up" | "brightness_down" })
    - "Desktop dikhao" -> systemControl({ action: "show_desktop" })
    - "Screen lock karo" -> systemControl({ action: "lock_screen" })
    - "Screen band karo / display sleep" -> systemControl({ action: "sleep_display" })
    - "Screenshot lo" -> systemControl({ action: "screenshot" })
    - "Task manager kholo" -> systemControl({ action: "task_manager" })
    - "PC restart / shutdown karo" -> require verbal confirmation first before setting confirmed: true!
- CRITICAL WINDOW & APPLICATION CONTROL RULE:
  * When the user asks to close an entire application (e.g. "Chrome band karo", "Chrome close kar do", "Word band karo"), ALWAYS use closeApplication({ appName: 'Chrome' }).
  * When the user asks to close, minimize, maximize, or restore a window, ALWAYS use closeWindow, minimizeWindow, or controlWindow.
  * NEVER EVER use clickAt to click the 'X' / close button on a window title bar or application frame. Coordinate clicking must NEVER be used as a fallback for closing applications or windows. Only use clickAt for interacting with actual page/document content.
- IMPORTANT: openWebsite now pauses for the user's on-screen confirmation before it actually runs. Calling it gets you back { result: "pending_confirmation" } right away. Just tell the user naturally that you've sent it over for them to confirm.
- If openApplication fails because the app isn't on PATH, don't just give up — ask the user for the app's exact .exe file location (they can find this by right-clicking its shortcut → Properties → Target). The moment they give you a path, call rememberAppLocation with it, then confirm it's saved and will open instantly by name from now on.
- When asked to perform browser actions or change the visual theme, use your tools (like openWebsite or changeThemeColor) smoothly and acknowledge with witty flare!
- You are the Main AI and final quality gate. Internal specialists are Coding, Deep Research, Live Research & Execution, Video Analysis, Image Studio (Pixel Artisan), and YouTube Agent. The user never selects them. For a substantial research, current-information, project/code, video, multi-asset image, or YouTube creator task (e.g. 'Analyze my channel', '/yt-audit', scripts, packaging, retention, shorts, SEO), call delegateTask with a self-contained task and the appropriate focus; use multiple independent tasks when a request genuinely spans specialties.
- YOUTUBE AGENT & CHANNEL AUDIT SKILL (yt-audit & YouTube Agent Router):
  * When the user asks to analyze, audit, or review their YouTube channel (e.g. 'Analyze my channel', 'audit my channel', '/yt-audit', 'why isn't my channel growing'), call delegateTask to trigger the yt-audit specialist module.
  * yt-audit evaluates 5 diagnostic stages: last 10 titles shape/promises (via title.py), feed-size thumbnail readability, first 15 seconds opening lines/hooks of 3 recent videos (via hookscore.py), upload consistency/rhythm, and audience retention shape.
  * Strictly uses available channel data: never hallucinates metrics, fake views, or unprovided figures. If specific metrics are missing, it asks the creator for clarification on missing data while delivering an actionable report on what was provided.
  * Delivers: the single biggest fix for this week, three specific things already working, what NOT to do yet, and ends with the copyable block and the gate question: '**ship it, or change it?**'.
- IMAGE GENERATION & EDITING SKILL (generateImage & scripts/image_gen.py):
  * TOP-LEVEL MODES:
    1. Default built-in tool mode (preferred): built-in generateImage tool for image generation, editing, and transparent-image requests.
    2. Fallback CLI mode: scripts/image_gen.py CLI (generate, edit, generate-batch) when explicitly requested or confirmed.
  * DECISION TREE:
    - Intent: Generate new image (concept art, product shot, website hero, avatar, logo, 3D render) vs Edit existing image (inpainting, lighting/weather transformation, background replacement, object removal, transparent cutout).
    - Execution strategy: Single asset vs repeated calls/batch variants for multi-asset requests.
  * TAXONOMY SLUGS: 'photorealistic-natural', 'product-mockup', 'ui-mockup', 'infographic-diagram', 'scientific-educational', 'ads-marketing', 'productivity-visual', 'logo-brand', 'illustration-story', 'stylized-concept', 'historical-scene', 'background-extraction', 'precise-object-edit'.
  * TRANSPARENCY: For transparent images, set transparent: true; Aanya creates a clean isolated subject with native alpha channel extraction ready.
  * SAVE-PATH POLICY: Generated deliverables are automatically persisted non-destructively in the project workspace (Images/ or user's destinationPath) and rendered instantly on screen in the chat interface. Existing assets are never overwritten without explicit instruction; sibling versioned filenames (-v2, etc.) are created.
  * WHEN CALLED: Acknowledge out loud in Hinglish with your signature witty charm that you're crafting it right now, then celebrate the finished image deliverable once ready!
- Do not blindly repeat a specialist result. Check that it answers the request, identify gaps or failures, request a focused correction when needed, and clearly distinguish verified results from limitations. For code work, require the agent report its implementation pass, an independent review pass, and final regression validation; never claim those tests were run unless their report says so.
- Attachments arrive with verified metadata and may include system notes from specialist processing. Analyze only contents actually supplied to you. A ZIP listing is an inventory, not permission to execute or modify it; an unsupported attachment must be described as unavailable rather than guessed.
- HONESTY ABOVE ALL: Before claiming an action, answer, analysis, search, access, or file operation is complete, make sure it actually happened. If you lack the required capability, access, attachment, tool, or resource, say that directly in one clear sentence and say exactly what is needed next. Never use generic filler, invented progress, or pretend a task is underway when it is not.
- CALCULATED PERSEVERANCE: When a task has a safe, permitted path to even a partial result, work through it fully. While a multi-step task is in progress, give brief, concrete status updates based on real progress; share intermediate findings and state the likely outcome or remaining limitation. Do not stop at the first recoverable error: diagnose, make a sensible correction, retry, and then report the actual final state.
- Keep this communication natural, emotionally intelligent, witty, charming, and concise in Hinglish. Use playful, sassy warmth where it fits, but never let the persona obscure an important limitation, a failure, a safety warning, or the user’s next actionable step. No defensive language, excuses, or over-apologies: state facts, results, and the next practical move.`;

export const ZOYA_SYSTEM_INSTRUCTION = AANYA_SYSTEM_INSTRUCTION;

export type AanyaToolDeclaration = {
  name: string;
  description: string;
  parameters: {
    type: Type;
    properties: Record<string, { type: Type; description?: string }>;
    required?: string[];
  };
};

export type ZoyaToolDeclaration = AanyaToolDeclaration;

export const AANYA_TOOLS: Array<{ functionDeclarations: AanyaToolDeclaration[] }> = [
  {
    functionDeclarations: [
      {
        name: "openWebsite",
        description: "Opens a URL or popular website in the user's browser (e.g. YouTube, Spotify, Google, Twitter, GitHub, Wikipedia)",
        parameters: {
          type: Type.OBJECT,
          properties: {
            url: {
              type: Type.STRING,
              description: "The complete web address to open (e.g., https://youtube.com or https://spotify.com)"
            },
            siteName: {
              type: Type.STRING,
              description: "Friendly name of the website (e.g., 'YouTube', 'Spotify')"
            }
          },
          required: ["url"]
        }
      },
      {
        name: "changeThemeColor",
        description: "Changes the ambient color theme of Aanya's UI",
        parameters: {
          type: Type.OBJECT,
          properties: {
            theme: {
              type: Type.STRING,
              description: "Theme option: 'neon-pink', 'cyber-purple', 'emerald-glow', 'sunset-amber', 'midnight-blue'"
            }
          },
          required: ["theme"]
        }
      },
      {
        name: "showVisualAction",
        description: "Displays a pop-up visual card or interactive notification on screen (e.g., mood status, song request, weather snippet, spicy roast)",
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Title" },
            detail: { type: Type.STRING, description: "Detail" },
            actionType: { type: Type.STRING, description: "Category like 'mood', 'music', 'roast', 'secret'" }
          },
          required: ["title", "detail"]
        }
      },
      {
        name: "createFile",
        description: "Creates a file (a code file, a text note, anything) with the given content inside Aanya's workspace folder on the user's PC. Use this both when asked to save/create a file AND when asked to write code — write the code, then save it here.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            filename: {
              type: Type.STRING,
              description: "File name including extension, e.g. 'notes.txt' or 'app.py' or 'index.html'"
            },
            content: {
              type: Type.STRING,
              description: "The full text or code to write into the file"
            }
          },
          required: ["filename", "content"]
        }
      },
      {
        name: "searchWeb",
        description: "Opens a web search for the given query in the user's default system browser",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: "What to search for"
            }
          },
          required: ["query"]
        }
      },
      {
        name: "createFolder",
        description: "Creates a new empty folder inside Aanya's workspace on the user's PC. Use this when asked to make a folder/directory — separate from creating a file.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            folderName: {
              type: Type.STRING,
              description: "Folder name or relative path, e.g. 'MyProject' or 'MyProject/assets'"
            }
          },
          required: ["folderName"]
        }
      },
      {
        name: "openApplication",
        description: "Opens/launches an application on the user's PC by name (e.g. Notepad, Calculator, VS Code, Spotify)",
        parameters: {
          type: Type.OBJECT,
          properties: {
            appName: {
              type: Type.STRING,
              description: "Name of the application to open, e.g. 'notepad', 'calc', 'code' for VS Code"
            }
          },
          required: ["appName"]
        }
      },
      {
        name: "rememberAppLocation",
        description: "Saves the exact .exe file path for an application so it can be opened reliably by name from now on. Use this right after the user tells you where an app is installed, especially after openApplication failed to find it by name alone.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            appName: {
              type: Type.STRING,
              description: "The friendly name to remember this app by, e.g. 'Photoshop'"
            },
            path: {
              type: Type.STRING,
              description: "The full file path to the app's .exe, e.g. 'C:\\\\Program Files\\\\Adobe\\\\Photoshop\\\\Photoshop.exe'"
            }
          },
          required: ["appName", "path"]
        }
      },
      {
        // FEATURE (open existing files on the PC by voice): the user
        // wanted "double-click to open" behavior for files already on
        // their PC, not just creating new ones (createFile) or opening
        // websites/apps. Pairs with openFile below — use this first when
        // the exact path isn't already known.
        name: "findFile",
        description: "Searches the user's common personal folders (Desktop, Downloads, Documents, Pictures, Videos, Music) for files whose name contains the given text. Use this when the user asks to open a file but you don't already know its exact location — e.g. 'open my resume', 'find that vacation photo'. Returns matching file paths — if there's exactly one clear match, go ahead and open it with openFile; if there's more than one, read out the short file names and ask which one before opening.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: "Part of the file name to search for, e.g. 'resume' or 'vacation'."
            }
          },
          required: ["query"]
        }
      },
      {
        name: "openFile",
        description: "Opens an existing file on the user's PC with its default app — the same as the user double-clicking it in File Explorer (opens a PDF in a PDF viewer, a photo in Photos, a video in the default player, etc). Requires an exact file path — use findFile first if you don't already have one.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            path: {
              type: Type.STRING,
              description: "The full file path to open, typically taken from a findFile result."
            }
          },
          required: ["path"]
        }
      },
      {
        // FEATURE (Aanya builds AI agents inside herself for multiple
        // tasks, and tells the user proactively when done): see
        // handleDelegateTask for the full reasoning on scope
        // (research/analysis tasks, not screen-control tasks).
        name: "delegateTask",
        description: "Starts an independent background AI agent to research, analyze, audit YouTube channels, write scripts, or code — for anything the user wants looked into without blocking the live conversation while it works. Good for: 'Analyze my channel', '/yt-audit', 'audit my channel', 'write video script', 'find out X', 'compare A and B', 'look into Y'. NOT for anything needing clicks/typing on screen — this agent can't see or control the screen, use clickAt/typeText directly for those instead. As soon as you call this, tell the user out loud that you've started an agent on it, then keep the conversation going normally — you'll get a system note, unprompted, whenever it finishes (could be anywhere from seconds to over a minute), and should tell the user about it right away when that happens, in your own words. You can call this more than once to have several agents working on different things at the same time.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            taskName: {
              type: Type.STRING,
              description: "A short 2-5 word label for this task, e.g. 'gaming laptop research' — used to refer back to it later, especially if more than one agent is running at once."
            },
            taskDescription: {
              type: Type.STRING,
              description: "The full task, written as a clear, complete instruction or question. The background agent has no access to this conversation's earlier context, so include everything it needs to know."
            }
          },
          required: ["taskName", "taskDescription"]
        }
      },
      {
        name: "clickAt",
        description: "Clicks the mouse at a specific point on the user's real screen — works inside ANY app or window, not just the browser (e.g. clicking a YouTube play button, a button in Notepad, a taskbar icon). Requires the user to be screen-sharing right now — without it there is no way to know what's on screen or where things are. ALWAYS look at the most recent shared screen image before calling this. When there are several similar-looking items close together (e.g. multiple video thumbnails in a row, several buttons in a toolbar), look carefully at exactly which one matches what the user asked for by its title/label/content — not just its general position — before picking coordinates, since a small aim error can land on the wrong one of several neighbors.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            x: {
              type: Type.NUMBER,
              description: "X coordinate of the click, on a 0 to 1000 scale where 0 is the LEFT edge of the shared screen image and 1000 is the RIGHT edge (e.g. 500 = horizontal center, 250 = one quarter of the way across from the left). Do NOT use raw pixel numbers or the user's real screen resolution — always use this 0-1000 scale. The server converts this to the real screen automatically."
            },
            y: {
              type: Type.NUMBER,
              description: "Y coordinate of the click, on a 0 to 1000 scale where 0 is the TOP edge of the shared screen image and 1000 is the BOTTOM edge (e.g. 500 = vertical center, 750 = three quarters of the way down from the top). Do NOT use raw pixel numbers or the user's real screen resolution — always use this 0-1000 scale. The server converts this to the real screen automatically."
            },
            doubleClick: {
              type: Type.BOOLEAN,
              description: "True for a double-click (e.g. opening a file/icon), false or omitted for a single click (e.g. pressing a button)."
            }
          },
          required: ["x", "y"]
        }
      },
      {
        name: "typeText",
        description: "Types text using the real keyboard, into whatever field or window currently has focus on the user's screen — works in ANY app, not just the browser. Usually used right after clickAt has clicked into a text field.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            text: {
              type: Type.STRING,
              description: "The exact text to type"
            }
          },
          required: ["text"]
        }
      },
      {
        name: "scrollScreen",
        description: "Scrolls the mouse wheel up, down, left, or right at the current mouse position — works in ANY app or window, not just the browser. If the user doesn't give an exact amount, don't ask them for a percentage — just judge it yourself from what's visible: use a small amount (around 5-8) to nudge slightly, a normal/default amount (around 12-15) for a standard scroll request, or a larger amount (25-35+) if they want to jump further/skip past something. After scrolling, look at the next screen update — if the content you were looking for still isn't visible, scroll again rather than asking the user how far to go.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            direction: {
              type: Type.STRING,
              description: "Direction to scroll: 'up', 'down', 'left', or 'right'"
            },
            amount: {
              type: Type.NUMBER,
              description: "How many scroll 'steps' to perform. Pick this yourself based on the request and what's on screen (default 12-15 for standard scroll). Defaults to 14 if omitted."
            }
          },
          required: ["direction"]
        }
      },
      {
        // FEATURE (voice-triggered PC access): starts screen sharing
        // automatically — the user no longer has to click the screen-share
        // button. Not in TOOL_CONFIRMATION_LEVELS on purpose: this should
        // fire the instant the user asks, with no on-screen confirm popup
        // in between.
        name: "startPcAccess",
        description: "Starts sharing the user's screen so you can see it and control their PC (click, type, scroll, open apps/websites) with voice commands. Call this the moment the user asks you to take control of their PC, access their screen, or take over their computer — e.g. 'mera PC access lo', 'meri screen dekho', 'take control of my computer', 'ab mera PC tum chalao'. Once started, stay in control across as many separate commands as the user gives — do NOT call stopPcAccess on your own just because one task finished; only the user ending access should stop it. The moment you call this, say out loud, in EXACTLY these words and nothing else first: \"Main aapka PC access le rahi hoon sir.\" Then wait for their next instruction.",
        parameters: {
          type: Type.OBJECT,
          properties: {}
        }
      },
      {
        name: "stopPcAccess",
        description: "Stops sharing the user's screen and gives control of their PC back to them. Call this ONLY when the user explicitly asks for their PC access back or asks you to stop controlling their computer — e.g. 'mera PC access wapas do', 'band karo', 'stop accessing my PC'. Let them know briefly, in your own words, that you've handed control back.",
        parameters: {
          type: Type.OBJECT,
          properties: {}
        }
      },
      {
        name: "controlWindow",
        description: "Controls desktop window state (minimize, maximize, restore, close, focus/bring to front, switch). Use whenever user asks to manipulate a window, e.g. 'Chrome minimize karo', 'VS Code maximize karo', 'ise normal / restore karo', 'Notepad close karo', 'Chrome samne lao / switch to Chrome', 'window switch karo'.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            action: {
              type: Type.STRING,
              description: "Action to perform: 'minimize', 'maximize', 'restore', 'close', 'focus', or 'switch'"
            },
            target: {
              type: Type.STRING,
              description: "Target window title, app name, or 'active' for the currently focused window (e.g. 'Chrome', 'VS Code', 'Notepad', 'active'). Defaults to 'active' if not specified."
            }
          },
          required: ["action"]
        }
      },
      {
        name: "listWindows",
        description: "Lists all currently open visible desktop windows with their titles, application names, and active status. Call when the user asks what windows are open or what's on screen (e.g. 'Konsi windows khuli hain?', 'Kya kya open hai?').",
        parameters: {
          type: Type.OBJECT,
          properties: {}
        }
      },
      {
        name: "closeApplication",
        description: "Closes an entire application and all its processes/windows gracefully (with optional force). Call when user asks to close an application e.g. 'Chrome band karo', 'Word close kar do'.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            appName: {
              type: Type.STRING,
              description: "Name of the application to close (e.g. 'Chrome', 'Word', 'Notepad', 'Spotify')"
            },
            force: {
              type: Type.BOOLEAN,
              description: "Force kill the process if it is not responding (default false)"
            }
          },
          required: ["appName"]
        }
      },
      {
        name: "listProcesses",
        description: "Lists running user applications and background processes with PID and memory consumption. Call when user asks what processes or apps are running in the background.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            filter: {
              type: Type.STRING,
              description: "Optional filter string to match process names"
            }
          }
        }
      },
      {
        name: "systemControl",
        description: "Controls Windows system operations: volume (volume_up, volume_down, volume_mute, volume_unmute, volume_set), brightness (brightness_up, brightness_down), media (play_pause), desktop (show_desktop), session (lock_screen, sleep_display), utilities (task_manager, screenshot), or system power (restart, shutdown with safety confirmation).",
        parameters: {
          type: Type.OBJECT,
          properties: {
            action: {
              type: Type.STRING,
              description: "Action: 'volume_up', 'volume_down', 'volume_mute', 'volume_unmute', 'volume_set', 'brightness_up', 'brightness_down', 'play_pause', 'show_desktop', 'lock_screen', 'sleep_display', 'task_manager', 'screenshot', 'restart', 'shutdown'"
            },
            value: {
              type: Type.NUMBER,
              description: "Optional numeric value (e.g., 50 for volume_set percentage)"
            },
            confirmed: {
              type: Type.BOOLEAN,
              description: "Set to true only if the user explicitly confirmed a destructive action (restart or shutdown)"
            }
          },
          required: ["action"]
        }
      },
      {
        // FIX (minimize was clicking close by mistake): minimize/restore/close
        // sit right next to each other as tiny icons — a small aim error with
        // clickAt lands on the wrong one. Win+Down is the OS-level minimize
        // shortcut, so this works regardless of exactly where those icons are
        // drawn or how sharp the current screen frame is.
        name: "minimizeWindow",
        description: "Minimizes the specified window or currently active window using OS-level window management. Call this whenever the user asks to minimize a window (e.g. 'minimize karo', 'ise chhota karo', 'niche kar do isse', 'Chrome minimize karo').",
        parameters: {
          type: Type.OBJECT,
          properties: {
            target: {
              type: Type.STRING,
              description: "Optional target window or application name (e.g. 'Chrome', 'Notepad'). If omitted, minimizes the active window."
            }
          }
        }
      },
      {
        // FIX (same root cause as minimizeWindow): a dedicated, reliable
        // close action, kept clearly distinct from minimizeWindow so the two
        // are never confused with each other or with a clickAt guess.
        name: "closeWindow",
        description: "Closes the specified window or currently active window using OS-level window management. Call this ONLY when the user explicitly asks to close/band a window (e.g. 'close karo', 'ise band karo', 'Notepad close karo').",
        parameters: {
          type: Type.OBJECT,
          properties: {
            target: {
              type: Type.STRING,
              description: "Optional target window or application name (e.g. 'Notepad'). If omitted, closes the active window."
            }
          }
        }
      },
      {
        name: "generateImage",
        description: "Generates or edits visual images, illustrations, website/game assets, UI mockups, logos, product mockups, or photorealistic art based on the user's description. Call this whenever the user asks to generate, draw, design, or edit an image (e.g., 'image generate karo', 'ek picture banao', 'logo banao', 'avatar create karo', 'create a mockup').",
        parameters: {
          type: Type.OBJECT,
          properties: {
            prompt: {
              type: Type.STRING,
              description: "The creative, structured prompt describing the image (subject, style, composition, lighting, mood, color palette, and constraints)."
            },
            mode: {
              type: Type.STRING,
              description: "Execution mode: 'generate' for new images, or 'edit' when modifying an existing image while preserving components."
            },
            aspectRatio: {
              type: Type.STRING,
              description: "Aspect ratio for the image: '1:1' (default for avatars/logos), '16:9' (landscape/hero), '9:16' (mobile/story), '4:3', or '3:4'."
            },
            useCase: {
              type: Type.STRING,
              description: "Taxonomy slug, e.g.: 'photorealistic-natural', 'product-mockup', 'ui-mockup', 'infographic-diagram', 'scientific-educational', 'ads-marketing', 'productivity-visual', 'logo-brand', 'illustration-story', 'stylized-concept', 'historical-scene', 'background-extraction', 'precise-object-edit'."
            },
            transparent: {
              type: Type.BOOLEAN,
              description: "Set to true if a transparent background or clean isolated cutout is requested."
            },
            referenceImage: {
              type: Type.STRING,
              description: "Optional filename or path of an existing image asset to reference or edit."
            },
            destinationPath: {
              type: Type.STRING,
              description: "Optional custom save path or filename in workspace (e.g. 'Images/hero.png' or 'logo.png')."
            },
            style: {
              type: Type.STRING,
              description: "Optional visual style (e.g., 'photorealistic 8K', 'minimalist vector', '3D render', 'anime', 'digital oil painting')."
            },
            lighting: {
              type: Type.STRING,
              description: "Optional lighting specification (e.g., 'studio rim lighting', 'golden hour', 'cyberpunk neon glow', 'soft diffused')."
            },
            avoid: {
              type: Type.STRING,
              description: "Optional negative prompt or elements to avoid."
            }
          },
          required: ["prompt"]
        }
      }
    ]
  }
];
