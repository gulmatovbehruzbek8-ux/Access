const { Bot, InputFile } = require("grammy");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

// Configuration
const BOT_TOKEN = "8645051857:AAHTjN7RZqaZSa9rFHgGY8JHkayC3PZME5A"; 
const ALLOWED_USER_ID = 5101211596; 
const targetDir = "C:/Users/Digital/OneDrive/Desktop/project"; 

const bot = new Bot(BOT_TOKEN);

// Runtime Conversation State
let chatLogMemory = [];      
let isFirstMessage = true; 

// Hidden System Rule (Sent to AI on first prompt to govern its behavior)
const SYSTEM_RULE = `\n\n[SYSTEM INSTRUCTION: You have full internet access via Python scripts. If requested to perform tasks you cannot do directly (like generating images, fetching web data, or interacting with APIs), you MUST write and execute a script to accomplish it. CRITICAL FILE RULE: To prevent folder clutter, there is exactly one Batch file ("scratchpad.bat") and one Python file ("scratchpad.py"). You MUST edit these by completely deleting and rewriting everything inside them every time you need to write script code. Do not create any new or randomly named script files.]`;

function executeCommand(command, ctx, statusMsg, rawPrompt) {
    const timeoutId = setTimeout(() => {
        child.kill(); 
        bot.api.editMessageText(ctx.chat.id, statusMsg.message_id, "⏱️ *Timeout:* Task took over 2 minutes to complete processing.").catch(console.error);
    }, 120000); 

    const execOptions = {
        cwd: targetDir,
        shell: "C:\\Windows\\System32\\cmd.exe", 
        env: Object.assign({}, process.env, {
            SystemRoot: "C:\\Windows",
            PATH: "C:\\Windows\\system32;C:\\Windows;" + (process.env.PATH || "")
        })
    };

    const child = exec(command, execOptions, async (error, stdout, stderr) => {
        clearTimeout(timeoutId); 

        if (error && !stdout) {
            let errorFeedback = `❌ *Execution Error:*\n${error.message}`;
            if (stderr) errorFeedback += `\n\n*Stderr Output:*\n\`\`\`\n${stderr}\n\`\`\``;
            return bot.api.editMessageText(ctx.chat.id, statusMsg.message_id, errorFeedback.substring(0, 3900)).catch(console.error);
        }
        
        let output = "Completed with no text output.";
        if (stdout) output = stdout;
        else if (stderr) output = stderr;
        
        const cleanOutput = output.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').trim();

        await bot.api.editMessageText(ctx.chat.id, statusMsg.message_id, "💻 *Terminal Output:*\n\n" + cleanOutput.substring(0, 3900), { parse_mode: "Markdown" }).catch(async () => {
            await bot.api.editMessageText(ctx.chat.id, statusMsg.message_id, "💻 *Terminal Output (Raw View):*\n\n" + cleanOutput.substring(0, 3900));
        });

        chatLogMemory.push("[Bot Output]\n" + cleanOutput + "\n---");
        isFirstMessage = false;

        // AUTOMATION: Scan for recent archives OR image files to upload back to Telegram
        try {
            const files = fs.readdirSync(targetDir);
            const validExtensions = [".zip", ".png", ".jpg", ".jpeg"];
            
            for (const file of files) {
                const ext = path.extname(file).toLowerCase();
                
                if (validExtensions.includes(ext)) {
                    const filePath = path.join(targetDir, file);
                    const stats = fs.statSync(filePath);
                    
                    if (Date.now() - stats.mtimeMs < 60000) {
                        if (ext === ".zip") {
                            await ctx.reply("📦 Found recent archive! Uploading file...").catch(console.error);
                        } else {
                            await ctx.reply("🖼️ Found newly generated image! Uploading...").catch(console.error);
                        }
                        
                        // Sent as Document to prevent Telegram from heavily compressing high-res AI images
                        await ctx.replyWithDocument(new InputFile(filePath)).catch(console.error);
                    }
                }
            }
        } catch (err) {
            console.error("Failed to scan or send files:", err);
        }
    });

    if (child.stdin) {
        if (rawPrompt) {
            child.stdin.write(rawPrompt + "\n");
        }
        child.stdin.end(); 
    }
}

// Command: Reset Conversation Session
bot.command("reset", async (ctx) => {
    if (ctx.from.id !== ALLOWED_USER_ID) return;
    isFirstMessage = true;
    await ctx.reply("🔄 Conversation context cleared! Next message starts a fresh session and reinstalls core AI directives.");
});

// Command: Save Chat History Log
bot.command("save", async (ctx) => {
    if (ctx.from.id !== ALLOWED_USER_ID) return;
    if (chatLogMemory.length === 0) return ctx.reply("📝 No conversation history recorded in this runtime session yet!");

    const logFileName = "chat_session_" + Date.now() + ".md";
    const logFilePath = path.join(targetDir, logFileName);
    const logContent = "# Telegram-Antigravity Chat Session Log\n\n" + chatLogMemory.join("\n\n");

    try {
        fs.writeFileSync(logFilePath, logContent, "utf8");
        await ctx.reply("💾 Saved log as `" + logFileName + "` inside your project directory!");
        await ctx.replyWithDocument(new InputFile(logFilePath));
    } catch (err) {
        await ctx.reply("❌ Failed to save chat log file: " + err.message);
    }
});

// Handle Incoming Voice Messages from Telegram
bot.on("message:voice", async (ctx) => {
    if (ctx.from.id !== ALLOWED_USER_ID) return;

    const voice = ctx.message.voice;
    const fileName = `voice_note_${Date.now()}.ogg`;
    const localFilePath = path.join(targetDir, fileName);

    chatLogMemory.push("[User uploaded Voice Note]: " + fileName);
    const statusMsg = await ctx.reply("🎙️ Downloading voice clip to workspace...");

    try {
        const fileData = await ctx.api.getFile(voice.file_id);
        const fileUrl = "https://api.telegram.org/file/bot" + BOT_TOKEN + "/" + fileData.file_path;

        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error("HTTP error! status: " + response.status);
        
        fs.writeFileSync(localFilePath, Buffer.from(await response.arrayBuffer()));
        await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, "✅ Voice note saved to project folder.\n\n🤖 Triggering Antigravity audio processing...");

        let prompt = `The user sent a voice message recorded as an audio file named "${fileName}" inside the workspace. Please listen to this file and respond to or execute whatever request the user says in it.`;
        if (isFirstMessage) prompt += SYSTEM_RULE;

        const sanitizedPrompt = prompt.replace(/"/g, '\\"');
        const command = isFirstMessage 
            ? `agy --print --dangerously-skip-permissions "${sanitizedPrompt}"`
            : `agy --print --continue --dangerously-skip-permissions "${sanitizedPrompt}"`;
        
        executeCommand(command, ctx, statusMsg, prompt);

    } catch (err) {
        await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, "❌ *Voice Download Failed:*\n" + err.message);
    }
});

// Handle Incoming Files from Telegram
bot.on("message:document", async (ctx) => {
    if (ctx.from.id !== ALLOWED_USER_ID) return;

    const doc = ctx.message.document;
    const fileName = doc.file_name || ("downloaded_file_" + Date.now());
    const localFilePath = path.join(targetDir, fileName);

    chatLogMemory.push("[User uploaded file]: " + fileName);
    const statusMsg = await ctx.reply("📥 Downloading file to project workspace...");

    try {
        const fileData = await ctx.api.getFile(doc.file_id);
        const fileUrl = "https://api.telegram.org/file/bot" + BOT_TOKEN + "/" + fileData.file_path;

        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error("HTTP error! status: " + response.status);
        
        fs.writeFileSync(localFilePath, Buffer.from(await response.arrayBuffer()));
        await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, "✅ Saved file to project folder.\n\n🤖 Passing it to Antigravity context thread...");

        let prompt = `The user uploaded a new file named "${fileName}" into the workspace. Analyze its contents in context of our current project folder.`;
        if (isFirstMessage) prompt += SYSTEM_RULE;

        const sanitizedPrompt = prompt.replace(/"/g, '\\"');
        const command = isFirstMessage 
            ? `agy --print --dangerously-skip-permissions "${sanitizedPrompt}"`
            : `agy --print --continue --dangerously-skip-permissions "${sanitizedPrompt}"`;
        
        executeCommand(command, ctx, statusMsg, prompt);

    } catch (err) {
        await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, "❌ *Download Failed:*\n" + err.message);
    }
});

// Text Commands Handler
bot.on("message:text", async (ctx) => {
    if (ctx.from.id !== ALLOWED_USER_ID) return;

    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return; 

    chatLogMemory.push("[User Prompt]: " + text);
    let command = "";
    let statusMsg = null;

    if (text.toLowerCase().startsWith("echo")) {
        statusMsg = await ctx.reply("✍️ Writing custom script block to execution runtime...");
        const scriptContent = text.substring(4).trim();
        const scriptPath = path.join(targetDir, "runner.bat");
        
        try {
            fs.writeFileSync(scriptPath, scriptContent, "utf8");
            command = "runner.bat";
        } catch (fileErr) {
            return ctx.reply("❌ *File System Error:* Unable to compile code block.\n" + fileErr.message);
        }
        executeCommand(command, ctx, statusMsg, null);
    } 
    else if (text.startsWith("!")) {
        statusMsg = await ctx.reply("⚡ Executing direct system command...");
        command = text.substring(1).trim();
        executeCommand(command, ctx, statusMsg, null);
    } 
    else {
        statusMsg = await ctx.reply("🤖 Querying project-linked Antigravity Agent...");
        
        let prompt = text;
        if (isFirstMessage) prompt += SYSTEM_RULE;

        const sanitizedPrompt = prompt.replace(/"/g, '\\"');
        command = isFirstMessage 
            ? `agy --print --dangerously-skip-permissions "${sanitizedPrompt}"`
            : `agy --print --continue --dangerously-skip-permissions "${sanitizedPrompt}"`;
        
        executeCommand(command, ctx, statusMsg, prompt);
    }
});

// Startup Notification Routine
console.log("🚀 Non-interactive Antigravity background worker is online...");
bot.start({
    onStart: async (botInfo) => {
        console.log(`Bot @${botInfo.username} triggered active streaming runtime.`);
        try {
            await bot.api.sendMessage(
                ALLOWED_USER_ID, 
                `⚡ *Antigravity Headless Coding Bot Online*\n\nYour runtime environment has started successfully. Voice capabilities added and web-access rules established.`,
                { parse_mode: "Markdown" }
            );
        } catch (authError) {
            console.error("Failed to push system startup trace alert to user context:", authError.message);
        }
    }
});