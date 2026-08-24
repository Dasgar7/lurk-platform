import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const MODELS = [
  "anthropic/claude-sonnet-4",
  "openai/gpt-4o",
  "google/gemini-2.5-flash-preview",
  "meta-llama/llama-4-maverick",
];

const SYSTEM_PROMPT = `You are Lurk, an expert AI full-stack engineer that builds complete, working projects from plain-language descriptions.

Your job: given a user request (and optional follow-ups), output a single self-contained HTML document that implements the requested website, web app, or browser game.

RULES:
1. Output ONLY valid JSON. No markdown, no explanation outside the JSON.
2. The JSON schema must be exactly:
{
  "name": "short-app-name",
  "description": "one-line description",
  "icon": "single emoji that fits the app",
  "html": "<!DOCTYPE html>...complete HTML..."
}
3. The "html" field must be a complete, runnable HTML5 document.
   - Include all CSS in a <style> tag in <head>
   - Include all JS in a <script> tag before </body> (or type=module if needed)
   - Use modern, clean dark UI with neon-green accents (#39FF6A) when it fits the theme, otherwise choose colors that match the request
   - Make it responsive and mobile-friendly
   - For games: implement a real game loop, controls, score, win/lose states
   - For apps: include working state, forms, localStorage if useful, interactive elements
   - For websites: polished landing / portfolio / business pages with navigation and sections
4. Prefer vanilla HTML/CSS/JS so it runs instantly in an iframe with no build step.
   If the request clearly needs React, still emit a single HTML that loads React from CDN (unpkg) and uses Babel standalone for JSX, or pure JS.
5. When the user sends a follow-up, you receive the previous HTML. Modify it to satisfy the new request. Keep as much of the previous design as makes sense.
6. Never leave placeholder comments like "// TODO". The code must work.
7. Escape any characters so the JSON is valid (especially quotes and newlines inside the html string).

Return ONLY the JSON object.`;

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      prompt,
      previousHtml,
      history = [],
      attachments = [],
    }: {
      prompt: string;
      previousHtml?: string;
      history?: { role: string; content: string }[];
      attachments?: { name: string; type: string; dataUrl?: string }[];
    } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(generateFallback(prompt, previousHtml));
    }

    const userContentParts: string[] = [];
    userContentParts.push(prompt);

    if (attachments?.length) {
      userContentParts.push(
        "\n\n[User attached files: " +
          attachments.map((a) => `${a.name} (${a.type})`).join(", ") +
          ". Use them as visual/design reference if relevant.]"
      );
    }

    if (previousHtml) {
      userContentParts.push(
        "\n\n--- CURRENT PROJECT HTML (modify this, do not start from scratch unless asked) ---\n" +
          previousHtml.slice(0, 120000)
      );
    }

    const messages: Message[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.slice(-8).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: userContentParts.join("") },
    ];

    let lastError: string | null = null;

    for (const model of MODELS) {
      try {
        const res = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "https://lurk.app",
            "X-Title": "Lurk",
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.4,
            max_tokens: 16000,
            response_format: { type: "json_object" },
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          lastError = `${model}: ${res.status} ${errText.slice(0, 200)}`;
          continue;
        }

        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
          lastError = `${model}: empty content`;
          continue;
        }

        const parsed = parseModelJson(content);
        if (!parsed?.html) {
          lastError = `${model}: invalid JSON shape`;
          continue;
        }

        return NextResponse.json({
          name: parsed.name || deriveName(prompt),
          description: parsed.description || "Generated with Lurk",
          icon: parsed.icon || "⚡",
          html: parsed.html,
          model,
        });
      } catch (e: unknown) {
        lastError = `${model}: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    console.error("All models failed:", lastError);
    return NextResponse.json(generateFallback(prompt, previousHtml, lastError));
  } catch (err: unknown) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}

function parseModelJson(raw: string): {
  name?: string;
  description?: string;
  icon?: string;
  html?: string;
} | null {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function deriveName(prompt: string): string {
  const words = prompt
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ") || "Lurk App";
}

function generateFallback(
  prompt: string,
  previousHtml?: string,
  error?: string | null
) {
  if (previousHtml) {
    return {
      name: "Updated Project",
      description: "Kept previous version (API unavailable)",
      icon: "🔧",
      html: previousHtml,
      model: "fallback",
      warning: error || "OpenRouter unavailable — previous version kept",
    };
  }

  const name = deriveName(prompt);
  const lower = prompt.toLowerCase();
  const isGame =
    lower.includes("game") ||
    lower.includes("play") ||
    lower.includes("snake") ||
    lower.includes("pong") ||
    lower.includes("tetris") ||
    lower.includes("shooter");

  let html: string;

  if (isGame) {
    html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${name}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0a0a0a;color:#e8e8e8;font-family:system-ui;display:flex;flex-direction:column;align-items:center;min-height:100vh;padding:16px}
  h1{color:#39ff6a;text-shadow:0 0 12px rgba(57,255,106,.4);margin-bottom:8px}
  p{color:#888;margin-bottom:16px;text-align:center;max-width:420px}
  canvas{border:2px solid #39ff6a;box-shadow:0 0 20px rgba(57,255,106,.3);border-radius:8px;max-width:100%;background:#111}
  .hud{display:flex;gap:24px;margin:12px 0;font-size:14px}
  .hud span{color:#39ff6a}
  button{margin-top:12px;padding:10px 24px;background:#39ff6a;color:#0a0a0a;border:none;border-radius:8px;font-weight:600;cursor:pointer}
  button:hover{filter:brightness(1.1)}
</style>
</head>
<body>
  <h1>${name}</h1>
  <p>${prompt.slice(0, 120)}</p>
  <div class="hud"><div>Score: <span id="score">0</span></div><div>Best: <span id="best">0</span></div></div>
  <canvas id="c" width="400" height="400"></canvas>
  <button id="btn">Start / Restart</button>
  <script>
    const canvas=document.getElementById('c'),ctx=canvas.getContext('2d');
    const grid=20,cols=20,rows=20;
    let snake=[{x:10,y:10}],dir={x:1,y:0},food={x:15,y:10},score=0,best=+localStorage.getItem('lurkBest')||0,running=false,loop;
    document.getElementById('best').textContent=best;
    function placeFood(){food={x:Math.floor(Math.random()*cols),y:Math.floor(Math.random()*rows)};}
    function draw(){
      ctx.fillStyle='#111';ctx.fillRect(0,0,400,400);
      ctx.fillStyle='#39ff6a';snake.forEach((s,i)=>{ctx.globalAlpha=i===0?1:0.7;ctx.fillRect(s.x*grid+1,s.y*grid+1,grid-2,grid-2)});
      ctx.globalAlpha=1;ctx.fillStyle='#ff4d4d';ctx.fillRect(food.x*grid+1,food.y*grid+1,grid-2,grid-2);
    }
    function tick(){
      if(!running)return;
      const head={x:snake[0].x+dir.x,y:snake[0].y+dir.y};
      if(head.x<0||head.x>=cols||head.y<0||head.y>=rows||snake.some(s=>s.x===head.x&&s.y===head.y)){running=false;clearInterval(loop);return;}
      snake.unshift(head);
      if(head.x===food.x&&head.y===food.y){score++;document.getElementById('score').textContent=score;if(score>best){best=score;localStorage.setItem('lurkBest',best);document.getElementById('best').textContent=best;}placeFood();}
      else snake.pop();
      draw();
    }
    document.getElementById('btn').onclick=()=>{snake=[{x:10,y:10}];dir={x:1,y:0};score=0;document.getElementById('score').textContent=0;placeFood();running=true;clearInterval(loop);loop=setInterval(tick,100);draw();};
    window.addEventListener('keydown',e=>{
      if(e.key==='ArrowUp'&&dir.y===0)dir={x:0,y:-1};
      if(e.key==='ArrowDown'&&dir.y===0)dir={x:0,y:1};
      if(e.key==='ArrowLeft'&&dir.x===0)dir={x:-1,y:0};
      if(e.key==='ArrowRight'&&dir.x===0)dir={x:1,y:0};
    });
    draw();
  </script>
</body>
</html>`;
  } else {
    html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${name}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0a0a0a;color:#e8e8e8;font-family:system-ui,sans-serif;line-height:1.6;min-height:100vh}
  header{padding:20px 24px;border-bottom:1px solid #222;display:flex;align-items:center;justify-content:space-between}
  .logo{color:#39ff6a;font-weight:700;font-size:1.25rem;text-shadow:0 0 10px rgba(57,255,106,.4)}
  nav a{color:#888;margin-left:20px;text-decoration:none;font-size:.9rem}
  nav a:hover{color:#39ff6a}
  .hero{padding:80px 24px;text-align:center;max-width:720px;margin:0 auto}
  .hero h1{font-size:clamp(2rem,5vw,3.2rem);margin-bottom:16px;background:linear-gradient(135deg,#39ff6a,#a8ffc0);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
  .hero p{color:#aaa;font-size:1.1rem;margin-bottom:32px}
  .btn{display:inline-block;padding:14px 32px;background:#39ff6a;color:#0a0a0a;border:none;border-radius:10px;font-weight:600;font-size:1rem;cursor:pointer;text-decoration:none;box-shadow:0 0 20px rgba(57,255,106,.35)}
  .btn:hover{filter:brightness(1.08)}
  .features{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px;padding:40px 24px;max-width:1000px;margin:0 auto}
  .card{background:#151515;border:1px solid #222;border-radius:12px;padding:24px}
  .card h3{color:#39ff6a;margin-bottom:8px}
  .card p{color:#888;font-size:.95rem}
  footer{text-align:center;padding:40px 24px;color:#555;font-size:.85rem;border-top:1px solid #1a1a1a;margin-top:40px}
</style>
</head>
<body>
  <header>
    <div class="logo">${name}</div>
    <nav><a href="#features">Features</a><a href="#about">About</a></nav>
  </header>
  <section class="hero">
    <h1>${name}</h1>
    <p>${prompt.slice(0, 160)}${prompt.length > 160 ? "…" : ""}</p>
    <a class="btn" href="#features">Get Started</a>
  </section>
  <section class="features" id="features">
    <div class="card"><h3>Fast</h3><p>Built instantly by Lurk from your description.</p></div>
    <div class="card"><h3>Beautiful</h3><p>Dark theme with neon accents out of the box.</p></div>
    <div class="card"><h3>Interactive</h3><p>Ready for you to iterate and improve.</p></div>
  </section>
  <footer id="about">Generated by Lurk · AI vibe coding</footer>
  <script>
    document.querySelectorAll('a[href^="#"]').forEach(a=>{
      a.addEventListener('click',e=>{e.preventDefault();document.querySelector(a.getAttribute('href'))?.scrollIntoView({behavior:'smooth'});});
    });
  </script>
</body>
</html>`;
  }

  return {
    name,
    description: prompt.slice(0, 80),
    icon: isGame ? "🎮" : "✨",
    html,
    model: "fallback",
    warning: error
      ? `API error — demo build shown. Set OPENROUTER_API_KEY for real AI generation. (${error})`
      : "Demo mode — set OPENROUTER_API_KEY for full AI generation.",
  };
}
