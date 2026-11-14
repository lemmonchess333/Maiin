#!/usr/bin/env python3
"""Scratch: write the three direction artboards from one shared shell.

The date bar, macros, meal track, field, diary and tab bar are the same
in all three, so they are written once here. Each direction adds its
hero, its styles and the values its hero needs. Output is plain
.dc.html, one file per artboard, under canvas/project/.
"""
import pathlib

OUT = pathlib.Path(__file__).parent / "canvas" / "project"

ART = {
    "bowl": "1e1e4878764e4f85520bfabaca7e0ebe",
    "bread": "df2ef4534e223876de76ea823c344cde",
    "drink": "382c49d70b541463876ba1c5e38ab085",
    "eggs": "4efec1b815de9489c538dfb557292b94",
    "fruit": "3b2be69e2c3942cd6c68c0722d8d51d9",
    "grains": "a5cf269fa905bb119e424b8de09a52d6",
    "plate": "ecfea039d082bacd73819530ef8bd58c",
    "protein": "6f55a2ef93b3318ad327a1ca862c0d59",
    "salad": "2d5c7c2e905ead7353640bdfb9f5585b",
    "sweet": "4e9185fadd9964ec4b65793d8c070c43",
}


def art(name):
    return "/_blob/" + ART[name]


ADDS = [("Flat white", 120, "drink"), ("Banana", 105, "fruit"), ("Toast and honey", 110, "bread")]

TOKENS = """
body{margin:0}
.phone{--page:#0E0E11;--card:#17171B;--raise:#212127;--raise2:#2C2C34;--fg:#F4F4F6;--mut:#A1A1AA;--or:#D9884E;--or-deep:#B45308;--groove:rgba(161,161,170,.2);--edge:inset 0 1px 0 rgba(255,255,255,.08),inset 0 0 0 1px rgba(255,255,255,.06),0 1px 3px rgba(0,0,0,.3),0 8px 24px -6px rgba(0,0,0,.45);--chip:inset 0 1px 0 rgba(255,255,255,.09),inset 0 0 0 1px rgba(255,255,255,.06),0 1px 2px rgba(0,0,0,.5);--sel:inset 0 0 0 1.5px rgba(255,255,255,.34),0 8px 24px -6px rgba(0,0,0,.45);--plate-a:#2A2A31;--plate-b:#1A1A1F;--well-a:#232329;--well-b:#15151A;--plate-line:rgba(255,255,255,.08);--glow:rgba(217,136,78,.22);--glow2:rgba(217,136,78,.07);--band:linear-gradient(180deg,#2B1A10 0%,#1F1611 58%,#0E0E11 100%);--pro:#EC4899;--carb:#EAB308;--fat:#7CB46C;--brand:#8F87F1;--brand-bg:rgba(123,114,233,.18);--nav:rgba(21,21,25,.9);--well-ink:#A1A1AA;--or-ink:#D9884E;--or-bar:#D9884E;--art-shadow:drop-shadow(0 6px 8px rgba(0,0,0,.45))}
.phone.t-light{--page:#ECECEE;--card:#FFFFFF;--raise:#F8F8F9;--raise2:#FFFFFF;--fg:#09090B;--mut:#6A6A72;--or:#D9884E;--or-deep:#A34B08;--groove:rgba(106,106,114,.2);--edge:0 1px 2px rgba(16,16,24,.05),0 4px 10px -2px rgba(16,16,24,.05),0 16px 32px -12px rgba(16,16,24,.1);--chip:0 1px 2px rgba(16,16,24,.08),0 0 0 1px rgba(16,16,24,.05);--sel:inset 0 0 0 1.5px rgba(16,16,24,.55),0 16px 32px -12px rgba(16,16,24,.1);--plate-a:#FFFFFF;--plate-b:#F3F3F6;--well-a:#EDEDF1;--well-b:#E4E4EA;--plate-line:rgba(16,16,24,.1);--glow:rgba(217,136,78,.2);--glow2:rgba(217,136,78,.08);--band:linear-gradient(180deg,#F8E3D2 0%,#F3E7DD 58%,#ECECEE 100%);--pro:#DB2777;--carb:#CA8A04;--fat:#5E9A4E;--brand:#5B50D6;--brand-bg:rgba(123,114,233,.14);--nav:rgba(255,255,255,.88);--well-ink:#55555D;--or-ink:#A34B08;--or-bar:#A34B08;--art-shadow:drop-shadow(0 5px 7px rgba(16,16,24,.22))}
.phone *{box-sizing:border-box}
.phone button{font:inherit;color:inherit;background:none;border:0;padding:0;margin:0;cursor:pointer}
.fig{font-family:'Archivo',system-ui,sans-serif;font-weight:800;font-variant-numeric:tabular-nums}
.disp{font-family:'Archivo',system-ui,sans-serif;font-style:italic;font-stretch:125%;font-weight:900;font-variant-numeric:tabular-nums}
.num{font-variant-numeric:tabular-nums}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes rowin{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
.slide{transition:transform .5s cubic-bezier(.32,.72,0,1)}
.seg{flex:1 1 calc((24.4em * var(--ts, 1) - 100%) * 999);max-width:calc(50% - 1px)}
.mealchip,.mealmenu{display:none}
.meal-chip .mealtrack{display:none !important}
.meal-chip .mealchip{display:flex}
.meal-chip .pen{order:3}
.meal-chip .scan{order:4}
.meal-chip.mopen .mealmenu{display:block;animation:fade .12s linear both}
.row{display:flex}
.row.add{display:none}
.row.add.on{display:flex;animation:rowin .25s ease-out .3s both}
.d-heavy .row.add{display:flex}
.d-empty .row.base{display:none}
.nothing{display:none}
.d-empty.n0 .nothing{display:flex}
.sheet{display:none}
.open .sheet{display:block;animation:fade .12s linear both}
.open .tabbar{display:none !important}
.opt.on{display:none !important}
.m-reduced .slide{transition:none}
.m-reduced .row.add.on{animation:fade .15s linear both}
@media (prefers-reduced-motion: reduce){
.slide{transition:none}
.row.add.on{animation:fade .15s linear both}
}
"""

ICON = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'

HEADER = """
<div style="position: relative; display: flex; align-items: center; height: 44px; margin: 0 -10px">
<button aria-label="Previous day" style="flex: none; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; color: var(--mut)"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" @@ICON@@><path d="m15 18-6-6 6-6"></path></svg></button>
<button aria-label="Select date, today, Wednesday 11 November" style="min-width: 0; min-height: 44px; display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 6px; padding: 0 2px; text-align: left">
<span style="font-size: 16px; font-weight: 700">Today</span>
<span class="num" style="font-size: 14px; font-weight: 500; color: var(--mut)">Wed 11 Nov</span>
</button>
<button aria-label="Next day" disabled style="flex: none; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; color: var(--mut); opacity: .4"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" @@ICON@@><path d="m9 18 6-6-6-6"></path></svg></button>
<div style="flex: 1"></div>
<button aria-label="Adjust nutrition targets" style="flex: none; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; color: var(--mut)"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" @@ICON@@><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"></path><circle cx="12" cy="12" r="3"></circle></svg></button>
</div>
"""

WEEK = """
<div role="group" aria-label="This week" style="position: relative; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); margin: @@MT@@px -16px 0">
<sc-for list="{{week}}" as="d" hint-placeholder-count="7">
<button aria-label="{{d.aria}}" style="height: 44px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px">
<span style="font-size: 12px; font-weight: 600; color: {{d.ink}}">{{d.letter}}</span>
<span style="position: relative; display: block; width: 30px; height: 8px; border-radius: 4px; background: var(--groove); opacity: {{d.fade}}; box-shadow: {{d.ring}}; overflow: hidden"><span class="slide" style="position: absolute; inset: 0; border-radius: 4px; background: var(--or-bar); transform: translateX({{d.shift}})"></span></span>
</button>
</sc-for>
</div>
"""

MACRO_ICONS = {
    "pro": '<path d="M16.4 13.7A6.5 6.5 0 1 0 6.28 6.6c-1.1 3.13-.78 3.9-3.18 6.08A3 3 0 0 0 5 18c4 0 8.4-1.8 11.4-4.3"></path><path d="m18.5 6 2.19 4.5a6.48 6.48 0 0 1-2.29 7.2C15.4 20.2 11 22 7 22a3 3 0 0 1-2.68-1.66L2.4 16.5"></path><circle cx="12.5" cy="8.5" r="2.5"></circle>',
    "carb": '<path d="M2 22 16 8"></path><path d="M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"></path><path d="M7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"></path><path d="M11.47 4.53 13 3l1.53 1.53a3.5 3.5 0 0 1 0 4.94L13 11l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"></path><path d="M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z"></path>',
    "fat": '<path d="M12 4.5 10.5 2"></path><path d="M12 4.5c-3.5 0-6.5 2.5-6.5 6 0 6 3 11 6.5 11s6.5-5 6.5-11c0-3.5-3-6-6.5-6z"></path><circle cx="12" cy="14" r="3.5"></circle>',
}


def macro(key, name, hole):
    return f"""<button aria-label="{{{{{hole}.aria}}}}" style="display: block; text-align: left; min-height: 56px">
<span style="display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600"><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" style="flex: none; stroke: var(--{key})" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">{MACRO_ICONS[key]}</svg>{name}</span>
<span style="display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 4px; margin-top: 2px"><span class="fig" style="font-size: 20px">{{{{{hole}.value}}}}</span><span style="font-size: 14px; color: var(--mut)">{{{{{hole}.unit}}}}</span></span>
<span style="position: relative; display: block; height: 4px; margin-top: 6px; border-radius: 2px; background: var(--groove); overflow: hidden"><span class="slide" style="position: absolute; inset: 0; border-radius: 2px; background: var(--{key}); transform: translateX({{{{{hole}.shift}}}})"></span></span>
</button>"""


MACROS = (
    '\n<div style="position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: @@MT@@px">\n'
    + "\n".join([macro("pro", "Protein", "m1"), macro("carb", "Carbs", "m2"), macro("fat", "Fat", "m3")])
    + "\n</div>\n"
)

TRACK = """
<div class="mealtrack" role="radiogroup" aria-label="Add to meal" style="position: relative; display: flex; flex-wrap: wrap; gap: 2px; min-height: 48px; margin-top: @@MT@@px; padding: 2px; border-radius: 14px; background: var(--raise); box-shadow: var(--chip)">
<sc-for list="{{meals}}" as="s" hint-placeholder-count="4">
<button class="seg" role="radio" aria-checked="{{s.checked}}" onClick="{{s.pick}}" style="display: flex; align-items: center; justify-content: center; gap: 6px; min-width: 0; min-height: 44px; border-radius: 12px; font-size: 14px; font-weight: 600; color: {{s.ink}}; background: {{s.bg}}; box-shadow: {{s.edge}}"><span aria-hidden="true" style="flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--or-ink); display: {{s.dot}}"></span><span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{s.label}}</span></button>
</sc-for>
</div>
"""


def option(i, name, kcal, pic):
    return f"""<button class="opt {{{{a{i}}}}}" onClick="{{{{add{i}}}}}" aria-label="Add {name}, {kcal} kcal" style="display: flex; align-items: center; gap: 12px; width: 100%; min-height: 48px; padding: 0 4px 0 14px; text-align: left">
<img alt="" src="{art(pic)}" style="flex: none; width: 36px; height: 36px">
<span style="flex: 1; min-width: 0; font-size: 16px; font-weight: 600">{name}</span>
<span class="num" style="flex: none; font-size: 14px; color: var(--mut)">{kcal} kcal</span>
<span aria-hidden="true" style="flex: none; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center"><span style="width: 30px; height: 30px; border-radius: 50%; background: var(--raise2); box-shadow: var(--chip); display: flex; align-items: center; justify-content: center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg></span></span>
</button>"""


FIELD = (
    """
<div style="position: relative; margin-top: @@MT@@px">
<div style="display: flex; align-items: center; min-height: 48px; border-radius: 14px; background: var(--raise); box-shadow: var(--chip)">
<button class="mealchip" onClick="{{toggleMealMenu}}" aria-label="Add to {{mealLabel}}. Change meal" style="order: 1; flex: none; align-items: center; gap: 6px; min-height: 44px; margin-left: 4px; padding: 0 10px; border-radius: 11px; background: var(--raise2); box-shadow: var(--chip); font-size: 14px; font-weight: 600"><span aria-hidden="true" style="flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--or-ink)"></span>{{mealLabel}}<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" @@ICON@@><path d="m6 9 6 6 6-6"></path></svg></button>
<button class="pen" aria-label="Enter manually" style="order: 1; flex: none; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; color: var(--mut)"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" @@ICON@@><path d="M13 21h8"></path><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"></path></svg></button>
<button onClick="{{openSheet}}" aria-label="What did you eat" style="order: 2; padding-left: 4px; flex: 1; min-width: 0; min-height: 48px; text-align: left; font-size: 16px; color: var(--mut)">{{placeholder}}</button>
<button class="scan" aria-label="Scan a meal" style="order: 3; flex: none; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; color: var(--or-ink)"><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" @@ICON@@><path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"></path><circle cx="12" cy="13" r="3"></circle></svg></button>
</div>
<div class="mealmenu" role="radiogroup" aria-label="Add to meal" style="position: absolute; left: 0; top: 54px; z-index: 6; width: 190px; border-radius: 16px; background: var(--card); box-shadow: var(--edge); padding: 4px 0">
<sc-for list="{{meals}}" as="s" hint-placeholder-count="4">
<button role="radio" aria-checked="{{s.checked}}" onClick="{{s.pick}}" style="display: flex; align-items: center; gap: 8px; width: 100%; min-height: 44px; padding: 0 14px; text-align: left; font-size: 16px; font-weight: 600; color: {{s.ink}}"><span aria-hidden="true" style="flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--or-ink); visibility: {{s.vis}}"></span>{{s.label}}</button>
</sc-for>
</div>
<div class="sheet" style="position: absolute; left: 0; right: 0; top: 54px; z-index: 5; border-radius: 16px; background: var(--card); box-shadow: var(--edge); padding: 4px 0">
<div style="padding: 8px 14px 2px; font-size: 14px; font-weight: 600; color: var(--mut)">Your usual</div>
"""
    + "\n".join(option(i + 1, *a) for i, a in enumerate(ADDS))
    + """
</div>
</div>
"""
)


def row(cls, name, pic, meal, time, kcal):
    return f"""<div class="row {cls}" style="align-items: center; gap: 12px; min-height: 68px; padding: 10px 16px"><img alt="" src="{art(pic)}" style="flex: none; width: 48px; height: 48px"><span style="flex: 1; min-width: 0"><span style="display: block; font-size: 16px; font-weight: 600">{name}</span><span class="num" style="display: block; font-size: 12px; color: var(--mut)">{meal} · {time}</span></span><span class="num" style="flex: none; font-size: 14px; color: var(--mut)">{kcal} kcal</span></div>"""


LOG = (
    """
<div style="position: relative; margin-top: @@MT@@px; border-radius: 16px; background: var(--card); box-shadow: var(--edge); overflow: hidden">
<div style="display: flex; align-items: baseline; justify-content: space-between; padding: 14px 16px 6px">
<span style="font-size: 14px; font-weight: 600; color: var(--mut)">Food log</span>
<span class="num" style="font-size: 14px; color: var(--mut)">{{count}}</span>
</div>
<div class="nothing" style="align-items: center; gap: 12px; min-height: 68px; padding: 10px 16px"><img alt="" src="@@PLATE@@" style="flex: none; width: 48px; height: 48px; opacity: .7"><span style="font-size: 16px; color: var(--mut)">Meals you log today show here.</span></div>
"""
    + "\n".join(
        [
            row("add {{a3}}", "Toast and honey", "bread", "{{meal3}}", "21:52", 110),
            row("add {{a2}}", "Banana", "fruit", "{{meal2}}", "21:51", 105),
            row("add {{a1}}", "Flat white", "drink", "{{meal1}}", "21:50", 120),
            row("base", "Salmon and veg", "protein", "Dinner", "19:31", 540),
            row("base", "Greek yogurt", "bowl", "Snacks", "16:24", 180),
            row("base", "Chicken and rice", "grains", "Lunch", "13:17", 650),
        ]
    )
    + "\n</div>\n"
).replace("@@PLATE@@", art("plate"))

NAV_ITEM = 'height: 54px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; text-decoration: none; font-size: 12px;'
NAV_SVG = 'aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'
NAV = f"""
<nav class="tabbar" aria-label="Main" style="position: absolute; left: 16px; right: 16px; bottom: 8px; height: 64px; border-radius: 32px; background: var(--nav); -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px); box-shadow: var(--edge); display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); align-items: center; padding: 0 5px">
<a href="#home" style="{NAV_ITEM} color: var(--fg); font-weight: 500"><svg {NAV_SVG} fill="none"><path d="M3.5 9 12 4.2 20.5 9v9.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5Z"></path><path d="M9.75 20v-4.75a1 1 0 0 1 1-1h2.5a1 1 0 0 1 1 1V20"></path></svg>Home</a>
<a href="#train" style="{NAV_ITEM} color: var(--fg); font-weight: 500"><svg {NAV_SVG} fill="none"><rect x="6" y="6.5" width="2.5" height="11" rx="1"></rect><rect x="15.5" y="6.5" width="2.5" height="11" rx="1"></rect><rect x="3.25" y="9" width="2.75" height="6" rx="1"></rect><rect x="18" y="9" width="2.75" height="6" rx="1"></rect><path d="M8.5 12h7"></path></svg>Train</a>
<a href="#food" aria-current="page" style="{NAV_ITEM} border-radius: 27px; background: var(--brand-bg); color: var(--brand); font-weight: 600"><svg {NAV_SVG} fill="currentColor"><path d="M3.5 12h17a8.5 8.5 0 0 1-17 0Z"></path><path d="M12 12c0-3.4 1.7-6 5.5-7-.1 3.6-2 6-5.5 7Z"></path></svg>Food</a>
<a href="#social" style="{NAV_ITEM} color: var(--fg); font-weight: 500"><svg {NAV_SVG} fill="none"><circle cx="9" cy="8" r="3.25"></circle><path d="M3 19.5v-.75A4.75 4.75 0 0 1 7.75 14h2.5A4.75 4.75 0 0 1 15 18.75v.75"></path><path d="M15.2 5.2a3 3 0 0 1 0 5.6"></path><path d="M17.5 14.2a4.5 4.5 0 0 1 3.5 4.4v.9"></path></svg>Social</a>
<a href="#analytics" style="{NAV_ITEM} color: var(--fg); font-weight: 500"><svg {NAV_SVG} fill="none"><rect x="4.25" y="13.5" width="3.5" height="6.5" rx="1.1"></rect><rect x="10.25" y="9.5" width="3.5" height="10.5" rx="1.1"></rect><rect x="16.25" y="5" width="3.5" height="15" rx="1.1"></rect></svg>Analytics</a>
</nav>
"""

# One figure block, used under the plate (A) and nowhere else as is.
FIGURE_CENTRED = """
<button onClick="{{toggleMode}}" aria-label="{{figureAria}}" style="position: relative; display: flex; flex-direction: column; align-items: center; min-height: 44px; margin-top: 8px; padding: 0 12px">
<span style="display: flex; align-items: baseline; gap: 6px">
<span class="fig" style="font-size: 48px; line-height: 1">{{figure}}</span>
<span style="font-size: 20px; font-weight: 600; color: var(--mut)">{{figureLabel}}</span>
</span>
<span class="num" style="margin-top: 4px; font-size: 14px; font-weight: 500; color: var(--mut)">{{subline}}</span>
</button>
"""

LOGIC = r"""
class Component extends DCLogic {
constructor(props) {
super(props);
this.state = { n: 0, prev: 0, k: null, open: false, mode: "left", meal: "snacks", where: [] };
}
componentWillUnmount() {
if (this._raf) cancelAnimationFrame(this._raf);
if (this._wait) clearTimeout(this._wait);
}
renderVals() {
const DEFAULTS = { day: "typical", theme: "dark", motion: "full", w: 393 };
const day = this.props.day ?? DEFAULTS.day;
const theme = this.props.theme ?? DEFAULTS.theme;
const motion = this.props.motion ?? DEFAULTS.motion;
const w = Number(this.props.w ?? DEFAULTS.w);
const st = this.state || {};
const heavy = day === "heavy";
const n = heavy ? 0 : st.n || 0;
const prev = heavy ? 0 : st.prev || 0;
const K = st.k == null ? 1 : st.k;
const mode = st.mode || "left";
const where = st.where || [];
const TARGET = 2200;
const BASE = {
typical: { kcal: 1790, p: 125, c: 172, f: 56, items: 4 },
empty: { kcal: 0, p: 0, c: 0, f: 0, items: 0 },
heavy: { kcal: 2980, p: 171, c: 318, f: 94, items: 12 },
}[day];
const ADDS = [
{ kcal: 120, p: 6, c: 10, f: 5 },
{ kcal: 105, p: 1, c: 27, f: 0 },
{ kcal: 110, p: 3, c: 22, f: 1 },
];
const MEALS = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["snacks", "Snacks"], ["dinner", "Dinner"]];
const mealName = (id) => (MEALS.find((m) => m[0] === id) || MEALS[2])[1];
const sum = (key, upTo) => ADDS.slice(0, upTo).reduce((a, x) => a + x[key], BASE[key]);
const fmt = (v) => Math.round(v).toLocaleString("en-GB");
const reduced = motion === "reduced" || (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
// A figure that counts: it runs from its value before the last add to its value now.
const counted = (at) => Math.round(at(prev) + (at(n) - at(prev)) * K);
const logged = sum("kcal", n);
const left = TARGET - logged;
const over = left < 0;
const loggedShown = counted((i) => sum("kcal", i));
const leftShown = Math.abs(TARGET - loggedShown);
const play = (delay, ms) => {
if (this._raf) cancelAnimationFrame(this._raf);
if (this._wait) clearTimeout(this._wait);
if (reduced) return;
this._wait = setTimeout(() => {
const t0 = performance.now();
const step = (t) => {
const x = Math.min(1, (t - t0) / ms);
this.setState({ k: x < 1 ? 1 - Math.pow(1 - x, 3) : null });
if (x < 1) this._raf = requestAnimationFrame(step);
};
this._raf = requestAnimationFrame(step);
}, delay);
};
const macro = (name, key, goal) => {
const got = sum(key, n);
const rest = goal - got;
const fill = Math.min(100, Math.round((got / goal) * 100));
return {
value: fmt(Math.abs(rest)) + "g",
unit: rest < 0 ? "over" : "left",
shift: "-" + (100 - fill) + "%",
aria: name + ": " + fmt(got) + " of " + goal + " grams logged",
};
};
const todayFill = Math.min(100, Math.round((logged / TARGET) * 100));
const past = day === "empty" ? [null, null] : [81, 81];
const week = ["M", "T", "W", "T", "F", "S", "S"].map((letter, i) => {
const today = i === 2;
const fill = i < 2 ? past[i] : today ? todayFill : null;
return {
letter,
ink: today ? "var(--fg)" : "var(--mut)",
shift: "-" + (100 - (fill == null ? 0 : fill)) + "%",
fade: i > 2 || (i < 2 && fill == null) ? 0.45 : 1,
ring: today ? "0 0 0 2px var(--page), 0 0 0 3.5px var(--fg)" : "none",
aria: ["Monday 9", "Tuesday 10", "Wednesday 11", "Thursday 12", "Friday 13", "Saturday 14", "Sunday 15"][i] + " November" + (fill == null ? "" : ", " + fill + "% of target logged"),
};
});
const meal = st.meal || "snacks";
const meals = MEALS.map(([id, label]) => ({
label,
checked: meal === id ? "true" : "false",
ink: meal === id ? "var(--fg)" : "var(--mut)",
bg: meal === id ? "var(--raise2)" : "transparent",
edge: meal === id ? "var(--chip)" : "none",
dot: meal === id ? "block" : "none",
vis: meal === id ? "visible" : "hidden",
pick: () => this.setState({ meal: id, mealOpen: false }),
}));
const FAST = (this.props.pace ?? "0.6 s") === "0.6 s";
const add = (i) => () => {
if (n !== i || heavy) return;
this.setState({ n: i + 1, prev: i, k: reduced ? null : 0, open: false, where: where.slice(0, i).concat([meal]) });
play(COUNT_DELAY, COUNT_MS);
};
const items = BASE.items + n;
const out = {
day, theme, motion, w, n,
openClass: st.open ? "open" : "",
extraCls: "",
placeholder: "What did you eat?",
mealLabel: mealName(meal),
toggleMealMenu: () => this.setState({ mealOpen: !st.mealOpen, open: false }),
a1: n > 0 ? "on" : "", a2: n > 1 ? "on" : "", a3: n > 2 ? "on" : "",
meal1: mealName(where[0]), meal2: mealName(where[1]), meal3: mealName(where[2]),
add1: add(0), add2: add(1), add3: add(2),
figure: fmt(mode === "left" ? leftShown : loggedShown),
figureLabel: mode === "left" ? (over ? "kcal over" : "kcal left") : "kcal logged",
subline: mode === "left" ? fmt(logged) + " of " + fmt(TARGET) + " logged" : (over ? fmt(-left) + " over " : fmt(left) + " left of ") + fmt(TARGET),
figureAria: fmt(logged) + " of " + fmt(TARGET) + " kcal logged. Switch between left and logged.",
gaugeLabel: fmt(logged) + " of " + fmt(TARGET) + " kcal logged today",
week,
m1: macro("Protein", "p", 140), m2: macro("Carbs", "c", 273), m3: macro("Fat", "f", 61),
meals,
count: items === 0 ? "" : items === 1 ? "1 item" : items + " items",
toggleMode: () => this.setState({ mode: mode === "left" ? "logged" : "left" }),
openSheet: () => {
if (heavy) return;
if (n >= ADDS.length) { this.setState({ n: 0, prev: 0, k: null, open: false, where: [] }); return; }
this.setState({ open: !st.open });
},
};
@@EXTRA@@
return out;
}
}
"""

PROPS = """{"day":{"editor":"enum","options":["typical","empty","heavy"],"default":"typical","section":"State"},"theme":{"editor":"enum","options":["dark","light"],"default":"dark","section":"State"},"motion":{"editor":"enum","options":["full","reduced"],"default":"full","section":"State"},"w":{"editor":"enum","options":[393,320],"default":393,"section":"State"},"$preview":{"width":393,"height":852}}"""

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>@@TITLE@@</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,100..900;1,62..125,100..900&family=Plus+Jakarta+Sans:wght@400..800&display=swap">
<style>@@CSS@@</style>
</helmet>
<div class="phone t-{{theme}} m-{{motion}} d-{{day}} n{{n}} {{openClass}} {{extraCls}}" style="position: relative; width: {{w}}px; height: 852px; overflow: hidden; background: var(--page); color: var(--fg); font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 14px; line-height: 1.3">
@@BEHIND@@
<div style="position: absolute; inset: 0; overflow: hidden; padding: 28px 16px 0">
@@BODY@@
</div>
@@NAV@@
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='@@PROPS@@'>
@@LOGIC@@
</script>
</body>
</html>
"""


def part(text, mt=0):
    return text.replace("@@MT@@", str(mt)).replace("@@ICON@@", ICON)


def page(name, title, css, body, extra, behind="", delay=320, ms=600, more_props=""):
    logic = LOGIC.replace("@@EXTRA@@", extra.strip()).replace("COUNT_DELAY", str(delay)).replace("COUNT_MS", str(ms))
    html = (
        PAGE.replace("@@TITLE@@", title)
        .replace("@@CSS@@", TOKENS + css)
        .replace("@@BEHIND@@", behind.strip())
        .replace("@@BODY@@", body.strip())
        .replace("@@NAV@@", NAV.strip())
        .replace("@@PROPS@@", PROPS.replace('"$preview"', more_props + '"$preview"'))
        .replace("@@LOGIC@@", logic.strip())
    )
    assert "@@" not in html, [l for l in html.splitlines() if "@@" in l][:3]
    (OUT / name).write_text(html)
    print("wrote", name, len(html))


# ---------------------------------------------------------------- A. The plate

# Plate pieces: the day's food, each drawn at a size set by its kcal.
PIECES = [("pb1", "bowl", 38.5), ("pb2", "grains", 43.8), ("pb3", "bowl", 31.1), ("pb4", "protein", 41.4), ("pa1", "drink", 28.5), ("pa2", "fruit", 27.8), ("pa3", "bread", 28.0)]


def piece(key, pic, r):
    d = round(r * 2)
    return f"""<span class="pc {{{{{key}.cls}}}}" style="width: {d}px; height: {d}px; margin: -{d / 2:g}px 0 0 -{d / 2:g}px; transform: {{{{{key}.t}}}}; --fx: {{{{{key}.fx}}}}; --fy: {{{{{key}.fy}}}}"><img alt="" src="{art(pic)}"></span>"""


A_CSS = """
.arc{stroke-dasharray:760.27;transition:stroke-dashoffset .6s cubic-bezier(.32,.72,0,1) .32s;animation:draw .8s cubic-bezier(.32,.72,0,1) backwards}
.arc2{stroke-dasharray:760.27;animation:draw .9s cubic-bezier(.32,.72,0,1) .3s backwards}
@keyframes draw{from{stroke-dashoffset:760.27}}
.tick{opacity:0;transition:opacity .2s linear .7s}
.tick.on{opacity:1}
.pc{position:absolute;left:132px;top:132px;transition:transform .5s cubic-bezier(.32,.72,0,1)}
.pc img{display:block;width:100%;height:100%;filter:var(--art-shadow)}
.pc.off{display:none}
.pc.fly{z-index:3}
.pc.fly img{animation:land .56s cubic-bezier(.4,0,.2,1) both}
@keyframes land{from{transform:translate(var(--fx),var(--fy)) scale(.7);opacity:0}16%{opacity:1}to{transform:none;opacity:1}}
.first{display:none}
.d-empty.n0 .first{display:flex}
.more{display:none}
.d-heavy .more{display:flex}
.m-reduced .arc,.m-reduced .arc2{transition:none;animation:none}
.m-reduced .tick{transition:none}
.m-reduced .pc{transition:none}
.m-reduced .pc.fly img{animation:fade .15s linear both}
@media (prefers-reduced-motion: reduce){
.arc,.arc2{transition:none;animation:none}
.tick,.pc{transition:none}
.pc.fly img{animation:fade .15s linear both}
}
"""

TICK = '<line class="tick {{%s}}" x1="132" y1="3.5" x2="132" y2="18.5" style="transform-origin: 132px 132px; transform: rotate({{%sdeg}}deg)"></line>'

A_HERO = (
    """
<div data-hero style="position: relative; display: flex; flex-direction: column; align-items: center; margin-top: 8px">
<div aria-hidden="true" style="position: absolute; left: 50%; top: -34px; width: 340px; height: 340px; margin-left: -170px; border-radius: 50%; background: radial-gradient(closest-side, var(--glow), var(--glow2) 58%, transparent); pointer-events: none"></div>
<div style="position: relative; width: 264px; height: 264px; flex: none">
<svg role="img" aria-label="{{gaugeLabel}}, drawn as a plate holding what you ate" width="264" height="264" viewBox="0 0 264 264" style="display: block; position: absolute; inset: 0">
<defs>
<radialGradient id="pa" cx="40%" cy="24%" r="85%"><stop offset="0" style="stop-color: var(--plate-a)"></stop><stop offset="1" style="stop-color: var(--plate-b)"></stop></radialGradient>
<radialGradient id="wa" cx="50%" cy="88%" r="90%"><stop offset="0" style="stop-color: var(--well-a)"></stop><stop offset="1" style="stop-color: var(--well-b)"></stop></radialGradient>
</defs>
<circle cx="132" cy="132" r="129" fill="url(#pa)" style="stroke: var(--plate-line)" stroke-width="1"></circle>
<circle cx="132" cy="132" r="121" fill="none" style="stroke: var(--groove)" stroke-width="14"></circle>
<circle class="arc" cx="132" cy="132" r="121" fill="none" style="stroke: var(--or); stroke-dashoffset: {{arcOff}}; opacity: {{arcOn}}" stroke-width="14" stroke-linecap="round" transform="rotate(-90 132 132)"></circle>
<circle class="arc2" cx="132" cy="132" r="121" fill="none" style="stroke: var(--or-deep); stroke-dashoffset: {{arc2Off}}; opacity: {{arc2On}}" stroke-width="14" stroke-linecap="round" transform="rotate(-90 132 132)"></circle>
<g style="stroke: var(--plate-b)" stroke-width="3">
"""
    + "\n".join(TICK % (f"k{i}", f"k{i}") for i in range(1, 7))
    + """
</g>
<circle cx="132" cy="132" r="106" fill="url(#wa)" style="stroke: var(--plate-line)" stroke-width="1"></circle>
</svg>
"""
    + "\n".join(piece(*p) for p in PIECES)
    + """
<div class="first" style="position: absolute; left: 62px; top: 62px; width: 140px; height: 140px; border-radius: 50%; border: 1.5px dashed var(--groove); align-items: center; justify-content: center; text-align: center; padding: 0 18px; font-size: 14px; font-weight: 500; color: var(--well-ink)">Your first meal goes here</div>
<div class="more num" style="position: absolute; right: 26px; bottom: 30px; z-index: 4; height: 28px; padding: 0 10px; border-radius: 14px; background: var(--raise2); box-shadow: var(--chip); align-items: center; font-size: 14px; font-weight: 600">+5</div>
</div>
"""
    + FIGURE_CENTRED
    + "</div>\n"
).replace("{{k1deg}}", "{{k1d}}").replace("{{k2deg}}", "{{k2d}}").replace("{{k3deg}}", "{{k3d}}").replace("{{k4deg}}", "{{k4d}}").replace("{{k5deg}}", "{{k5d}}").replace("{{k6deg}}", "{{k6d}}")

A_EXTRA = r"""
// The rim: what is logged, clockwise from the top, with a tick where each entry ends.
const C = 760.27;
out.arcOff = (C * (1 - Math.min(1, logged / TARGET))).toFixed(1);
out.arcOn = logged > 0 ? 1 : 0;
out.arc2Off = (C * (1 - Math.max(0, Math.min(1, (logged - TARGET) / TARGET)))).toFixed(1);
out.arc2On = over ? 1 : 0;
const entries = (day === "empty" ? [] : heavy ? [640, 890, 510, 940] : [420, 650, 180, 540]).concat(ADDS.slice(0, n).map((a) => a.kcal));
let run = 0;
for (let i = 1; i <= 6; i++) {
const e = entries[i - 1];
if (e != null) run += e;
const show = e != null && i < entries.length && run < TARGET;
out["k" + i] = show ? "on" : "";
out["k" + i + "d"] = show ? ((run / TARGET) * 360).toFixed(1) : "0";
}
// The plate: every piece is a circle of its own size, packed inside the well.
const WELL = 101;
const all = [["pb1", 38.5, day !== "empty"], ["pb2", 43.8, day !== "empty"], ["pb3", 31.1, day !== "empty"], ["pb4", 41.4, day !== "empty"], ["pa1", 28.5, heavy || n > 0], ["pa2", 27.8, heavy || n > 1], ["pa3", 28, heavy || n > 2]];
const on = all.filter((p) => p[2]);
const area = on.reduce((a, p) => a + p[1] * p[1], 0);
const s = on.length ? Math.max(0.6, Math.min(1.3, Math.sqrt((0.56 * WELL * WELL) / area))) : 1;
const pts = on.map((p, i) => {
const a = ((-90 + ((i + 0.5) * 360) / on.length) * Math.PI) / 180;
const R = on.length === 1 ? 0 : 56;
return { x: Math.cos(a) * R, y: Math.sin(a) * R, r: p[1] * s };
});
for (let it = 0; it < 260; it++) {
for (const p of pts) { p.x *= 0.985; p.y *= 0.985; }
for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
const a = pts[i], b = pts[j];
let dx = b.x - a.x, dy = b.y - a.y;
const d = Math.hypot(dx, dy) || 0.01;
const min = a.r + b.r + 2;
if (d < min) { const push = (min - d) / 2; dx /= d; dy /= d; a.x -= dx * push; a.y -= dy * push; b.x += dx * push; b.y += dy * push; }
}
for (const p of pts) { const d = Math.hypot(p.x, p.y); const max = WELL - p.r; if (d > max) { p.x *= max / d; p.y *= max / d; } }
}
// A new piece starts at the field (its place on this board, measured from the plate's centre).
const FIELD_X = -86, FIELD_Y = 424;
all.forEach((p) => {
const i = on.indexOf(p);
if (i < 0) { out[p[0]] = { cls: "off", t: "none", fx: "0px", fy: "0px" }; return; }
const q = pts[i];
out[p[0]] = {
cls: p[0][1] === "a" && !heavy ? "fly" : "",
t: "translate(" + q.x.toFixed(1) + "px, " + q.y.toFixed(1) + "px) scale(" + s.toFixed(3) + ")",
fx: ((FIELD_X - q.x) / s).toFixed(0) + "px",
fy: ((FIELD_Y - q.y) / s).toFixed(0) + "px",
};
});
"""

A_BODY = part(HEADER) + A_HERO + part(WEEK, 10) + part(MACROS, 8) + part(TRACK, 14) + part(FIELD, 8) + part(LOG, 14)

page("A-Plate.dc.html", "Food, direction A: the plate", A_CSS, A_BODY, A_EXTRA)


# ---------------------------------------------------------------- B. The table

B_CSS = """
.tile{box-shadow:var(--edge)}
.tile.sel{box-shadow:var(--sel)}
.tile .dot{display:none;flex:none;width:6px;height:6px;border-radius:50%;background:var(--or-ink)}
.tile.sel .dot{display:block}
.r1{--dy:326px}
.r2{--dy:160px}
.tp{position:absolute;display:none;filter:var(--art-shadow)}
.tp.base,.tp.s0{display:block;left:10px;top:8px;width:84px;height:84px}
.d-empty .tp.base{display:none}
.tp.s1{display:block;right:8px;top:52px;width:40px;height:40px}
.tp.s2{display:block;right:46px;top:8px;width:40px;height:40px}
.tp.s3{display:block;right:44px;top:50px;width:40px;height:40px}
.tp.fly{z-index:3;animation:drop .42s cubic-bezier(.4,0,.2,1) both}
@keyframes drop{from{transform:translateY(var(--dy)) scale(.7);opacity:0}16%{opacity:1}to{transform:none;opacity:1}}
.hole{position:absolute;left:14px;top:14px;width:72px;height:72px;border-radius:50%;border:1.5px dashed var(--groove)}
.hole.off{display:none}
.slide.late{transition-delay:.3s}
.m-reduced .tp.fly{animation:fade .15s linear both}
@media (prefers-reduced-motion: reduce){
.tp.fly{animation:fade .15s linear both}
}
"""

PLUS = '<span aria-hidden="true" style="position: absolute; right: 12px; top: 12px; width: 32px; height: 32px; border-radius: 50%; background: var(--raise2); box-shadow: var(--chip); display: flex; align-items: center; justify-content: center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg></span>'


def tile(key, name, pic, rowcls):
    adds = "\n".join(f'<img class="tp {{{{{key}{i + 1}}}}}" alt="" src="{art(a[2])}">' for i, a in enumerate(ADDS))
    return f"""<button class="tile {rowcls} {{{{{key}.cls}}}}" onClick="{{{{{key}.pick}}}}" aria-pressed="{{{{{key}.pressed}}}}" aria-label="{{{{{key}.aria}}}}" style="position: relative; min-height: 156px; border-radius: 22px; background: var(--card); text-align: left">
<span class="hole {{{{{key}.hole}}}}" aria-hidden="true"></span>
<img class="tp base" alt="" src="{art(pic)}">
{adds}
<span style="position: absolute; left: 14px; right: 14px; bottom: 12px; display: block">
<span style="display: flex; align-items: center; gap: 6px; font-size: 16px; font-weight: 700"><span class="dot" aria-hidden="true"></span>{name}</span>
<span class="num" style="display: block; min-height: 18px; font-size: 14px; color: var(--mut)">{{{{{key}.kcal}}}}</span>
</span>
{PLUS}
</button>"""


B_HERO = (
    """
<section data-hero style="position: relative; margin-top: 8px">
<button onClick="{{toggleMode}}" aria-label="{{figureAria}}" style="display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 6px; width: 100%; min-height: 52px; text-align: left">
<span class="fig" style="font-size: 48px; line-height: 1">{{figure}}</span>
<span style="font-size: 20px; font-weight: 600; color: var(--mut)">{{figureLabel}}</span>
<span class="num" style="margin-left: auto; font-size: 14px; font-weight: 500; color: var(--mut)">{{subline}}</span>
</button>
<div role="img" aria-label="{{gaugeLabel}}" style="position: relative; height: 10px; margin-top: 8px; border-radius: 5px; background: var(--groove); overflow: hidden"><span class="slide late" style="position: absolute; inset: 0; border-radius: 5px; background: var(--or); transform: translateX({{barShift}})"></span><span class="slide late" style="position: absolute; inset: 0; border-radius: 5px; background: var(--or-deep); transform: translateX({{bar2Shift}})"></span></div>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 14px">
"""
    + "\n".join([tile("tb", "Breakfast", "bowl", "r1"), tile("tl", "Lunch", "grains", "r1"), tile("ts", "Snacks", "bowl", "r2"), tile("td", "Dinner", "protein", "r2")])
    + """
</div>
</section>
"""
)

B_EXTRA = r"""
// The bar: what is logged, and in a deeper orange what is over.
out.barShift = "-" + (100 - Math.min(100, (logged / TARGET) * 100)).toFixed(1) + "%";
out.bar2Shift = "-" + (100 - Math.max(0, Math.min(100, ((logged - TARGET) / TARGET) * 100))).toFixed(1) + "%";
// The table: one tile a meal. A tile holds that meal's food and its kcal.
const SET = day === "empty" ? {} : heavy ? { breakfast: 640, lunch: 890, snacks: 510, dinner: 940 } : { breakfast: 420, lunch: 650, snacks: 180, dinner: 540 };
[["tb", "breakfast"], ["tl", "lunch"], ["ts", "snacks"], ["td", "dinner"]].forEach(([key, id]) => {
const base = SET[id] || 0;
const at = (upTo) => where.slice(0, upTo).reduce((a, m, i) => a + (m === id ? ADDS[i].kcal : 0), base);
const has = at(n) > 0;
out[key] = {
cls: meal === id ? "sel" : "",
pressed: meal === id ? "true" : "false",
kcal: has ? fmt(counted(at)) + " kcal" : "",
hole: has ? "off" : "",
aria: mealName(id) + (has ? ", " + fmt(at(n)) + " kcal logged" : ", nothing logged") + ". Add to " + mealName(id).toLowerCase(),
pick: () => this.setState({ meal: id, open: !heavy && n < ADDS.length }),
};
let slot = base > 0 ? 1 : 0;
for (let i = 0; i < ADDS.length; i++) {
const here = i < n && where[i] === id;
out[key + (i + 1)] = here ? "s" + slot + " fly" : "";
if (here) slot++;
}
});
"""

B_BODY = part(HEADER) + B_HERO + part(FIELD, 12) + part(MACROS, 14) + part(WEEK, 6) + part(LOG, 12)

page("B-Table.dc.html", "Food, direction B: the table", B_CSS, B_BODY, B_EXTRA, delay=300, ms=500)


# ---------------------------------------------------------------- C. The arch

C_CSS = """
.phone.t-light{--mut:#5C5C65}
.arc{stroke-dasharray:477.52;transition:stroke-dashoffset .6s cubic-bezier(.32,.72,0,1) .3s;animation:draw .8s cubic-bezier(.32,.72,0,1) backwards}
.arc2{stroke-dasharray:477.52;animation:draw .9s cubic-bezier(.32,.72,0,1) .3s backwards}
@keyframes draw{from{stroke-dashoffset:477.52}}
.fl{position:absolute;display:none;width:44px;height:44px;margin:-22px 0 0 -22px;z-index:3;pointer-events:none}
.fl img{display:block;width:100%;height:100%;filter:var(--art-shadow)}
.fl.on{display:block;animation:rise .56s cubic-bezier(.4,0,.2,1) both}
@keyframes rise{from{transform:translate(var(--fx),var(--fy));opacity:0}14%{opacity:1}76%{opacity:1}to{transform:translate(0,0) scale(.45);opacity:0}}
.m-reduced .arc,.m-reduced .arc2{transition:none;animation:none}
.m-reduced .fl.on{display:none}
@media (prefers-reduced-motion: reduce){
.arc,.arc2{transition:none;animation:none}
.fl.on{display:none}
}
"""

ARCH = "M 28.5 182 A 152 152 0 0 1 332.5 182"


def flyer(i, pic):
    return f"""<span class="fl {{{{a{i}}}}}" aria-hidden="true" style="left: {{{{f{i}.x}}}}; top: {{{{f{i}.y}}}}; --fx: {{{{f{i}.fx}}}}; --fy: {{{{f{i}.fy}}}}"><img alt="" src="{art(pic)}"></span>"""


C_HERO = (
    f"""
<div style="position: relative">
<svg role="img" aria-label="{{{{gaugeLabel}}}}" viewBox="0 0 361 196" width="100%" style="display: block; overflow: visible">
<path d="{ARCH}" fill="none" style="stroke: var(--groove)" stroke-width="16" stroke-linecap="round"></path>
<path class="arc" d="{ARCH}" fill="none" style="stroke: var(--or); stroke-dashoffset: {{{{arcOff}}}}; opacity: {{{{arcOn}}}}" stroke-width="16" stroke-linecap="round"></path>
<path class="arc2" d="{ARCH}" fill="none" style="stroke: var(--or-deep); stroke-dashoffset: {{{{arc2Off}}}}; opacity: {{{{arc2On}}}}" stroke-width="16" stroke-linecap="round"></path>
</svg>
"""
    + "\n".join(flyer(i + 1, a[2]) for i, a in enumerate(ADDS))
    + """
<button onClick="{{toggleMode}}" aria-label="{{figureAria}}" style="position: absolute; left: 0; right: 0; bottom: {{figBottom}}px; display: flex; flex-direction: column; align-items: center">
<span style="display: flex; align-items: baseline; gap: 8px"><span class="disp" style="font-size: {{figSize}}px; line-height: .86">{{figure}}</span><span style="font-size: {{unitSize}}px; font-weight: 700; color: var(--mut)">kcal</span></span>
<span style="font-size: 20px; line-height: 24px; font-weight: 600; color: var(--mut)">{{figureWord}}</span>
</button>
</div>
<div class="num" style="position: relative; margin-top: 6px; text-align: center; font-size: 14px; font-weight: 500; color: var(--mut)">{{subline}}</div>
"""
)

C_EXTRA = r"""
// The arch: what is logged, left to right over the top.
const L = 477.52;
out.arcOff = (L * (1 - Math.min(1, logged / TARGET))).toFixed(1);
out.arcOn = logged > 0 ? 1 : 0;
out.arc2Off = (L * (1 - Math.max(0, Math.min(1, (logged - TARGET) / TARGET)))).toFixed(1);
out.arc2On = over ? 1 : 0;
const scale = (w - 32) / 361;
const long = out.figure.length >= 5;
out.figSize = w < 360 ? (long ? 40 : 56) : long ? 56 : 72;
out.unitSize = Math.round(out.figSize * 0.42);
out.figBottom = Math.round(14 * scale);
out.figureWord = mode === "left" ? (over ? "over" : "left") : "logged";
// Food rises from the field to where the arc ends, then the arc grows.
const fieldY = 264 + 196 * scale;
for (let i = 0; i < ADDS.length; i++) {
const p = Math.min(1, sum("kcal", i) / TARGET);
const X = (180.5 - 152 * Math.cos(Math.PI * p)) * scale;
const Y = (182 - 152 * Math.sin(Math.PI * p)) * scale;
out["f" + (i + 1)] = { x: X.toFixed(0) + "px", y: Y.toFixed(0) + "px", fx: (94 - X).toFixed(0) + "px", fy: (fieldY - Y).toFixed(0) + "px" };
}
"""

C_BEHIND = '<div data-hero aria-hidden="true" style="position: absolute; left: 0; right: 0; top: 0; height: 404px; background: var(--band)"></div>'

C_BODY = part(HEADER) + C_HERO + part(MACROS, 16) + part(WEEK, 20) + part(TRACK, 8) + part(FIELD, 8) + part(LOG, 14)

page("C-Arch.dc.html", "Food, direction C: the arch", C_CSS, C_BODY, C_EXTRA, behind=C_BEHIND, delay=300, ms=600)



# ---------------------------------------------------------------- D. The wheel
# The owner's pick, 11 November: A's page, with the calorie wheel as it is
# today as the hero. The calories sit inside it. No food sits on it.

D_CSS = """
.phone{--glow:rgba(217,136,78,.12);--glow2:rgba(217,136,78,.04)}
.phone.t-light{--glow:rgba(217,136,78,.14);--glow2:rgba(217,136,78,.05)}
.ring{stroke-dasharray:464.96;transition:stroke-dashoffset .6s cubic-bezier(.32,.72,0,1) .3s;animation:draw .8s cubic-bezier(.32,.72,0,1) backwards}
@keyframes draw{from{stroke-dashoffset:464.96}}
.fl{position:absolute;display:none;width:44px;height:44px;margin:-22px 0 0 -22px;z-index:3;pointer-events:none}
.fl img{display:block;width:100%;height:100%;filter:var(--art-shadow)}
.fl.on{display:block;animation:rise .56s cubic-bezier(.4,0,.2,1) both}
.noflight .fl.on{display:none}
.swap{display:none}
.goal-on .swap{display:block}
.pace-fast .fl.on{animation-duration:.4s}
.pace-fast .ring{transition-duration:.35s;transition-delay:.25s}
.pace-fast .row.add.on{animation-delay:.2s}
@keyframes rise{from{transform:translate(var(--fx),var(--fy));opacity:0}14%{opacity:1}76%{opacity:1}to{transform:translate(0,0) scale(.45);opacity:0}}
.m-reduced .ring{transition:none;animation:none}
.m-reduced .fl.on{display:none}
@media (prefers-reduced-motion: reduce){
.ring{transition:none;animation:none}
.fl.on{display:none}
}
"""

D_HERO = (
    """
<div data-hero style="position: relative; display: flex; flex-direction: column; align-items: center; margin-top: 8px">
<div aria-hidden="true" style="position: absolute; left: 50%; top: -34px; width: 340px; height: 340px; margin-left: -170px; border-radius: 50%; background: radial-gradient(closest-side, var(--glow), var(--glow2) 58%, transparent); pointer-events: none"></div>
<button class="{{flyCls}}" onClick="{{toggleMode}}" aria-label="{{figureAria}}" style="position: relative; width: 264px; height: 264px; flex: none; border-radius: 50%">
<svg aria-hidden="true" viewBox="0 0 160 160" width="264" height="264" style="display: block">
<circle cx="80" cy="80" r="74" fill="none" style="stroke: var(--groove)" stroke-width="12"></circle>
<circle class="ring" cx="80" cy="80" r="74" fill="none" style="stroke: var(--or); stroke-dashoffset: {{ringOff}}; opacity: {{ringOn}}" stroke-width="12" stroke-linecap="round" transform="rotate(-90 80 80)"></circle>
<circle class="ring" cx="80" cy="80" r="74" fill="none" style="stroke: var(--page); stroke-dashoffset: {{lapOff}}; opacity: {{lapOn}}" stroke-width="14.5" stroke-linecap="round" transform="rotate(-90 80 80)"></circle>
<circle class="ring" cx="80" cy="80" r="74" fill="none" style="stroke: var(--or-deep); stroke-dashoffset: {{lapOff}}; opacity: {{lapOn}}" stroke-width="12" stroke-linecap="round" transform="rotate(-90 80 80)"></circle>
</svg>
<span style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none">
<span class="fig" style="font-size: 48px; line-height: 1">{{figure}}</span>
<span style="margin-top: 8px; display: flex; align-items: center; gap: 4px; font-size: 14px; color: var(--mut)"><span class="num">{{wheelLabel}}</span><svg class="swap" aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" @@ICON@@><path d="m7 15 5 5 5-5"></path><path d="m7 9 5-5 5 5"></path></svg></span>
</span>
"""
    + "\n".join(flyer(i + 1, a[2]) for i, a in enumerate(ADDS))
    + """
</button>
<button aria-label="Details" style="position: relative; display: flex; align-items: center; gap: 4px; min-height: 44px; padding: 0 12px; font-size: 14px; font-weight: 500">Details<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" @@ICON@@><path d="m9 18 6-6-6-6"></path></svg></button>
</div>
"""
)

D_EXTRA = r"""
// Decided 11 November: the wheel fills with what is logged in both modes, and nothing logged is grey.
// The ring switch shows today's behaviour beside it: in "left" mode it empties as you log.
const ringMode = this.props.ring ?? "fills";
const C = 464.96;
const prog = (i) => Math.min(1, sum("kcal", i) / TARGET);
const fillAt = (i) => (ringMode === "fills" || mode !== "left" ? prog(i) : 1 - prog(i));
out.ringOff = (C * (1 - fillAt(n))).toFixed(1);
out.ringOn = fillAt(n) > 0 ? 1 : 0;
out.lapOff = (C * (1 - Math.max(0, Math.min(1, (logged - TARGET) / TARGET)))).toFixed(1);
out.lapOn = over ? 1 : 0;
out.flyCls = (this.props.flight ?? true) ? "" : "noflight";
// From the research, adopted 11 November: the target stays on the wheel, one meal chip, a quicker log.
// The three switches show the pick as it was before.
const goalOn = (this.props.goal ?? "on") === "on";
const chip = (this.props.meal ?? "chip") === "chip";
out.wheelLabel = goalOn ? (over && mode === "left" ? "kcal over " : out.figureLabel + " of ") + fmt(TARGET) : out.figureLabel;
// The app's own placeholder is a short rotating example ("Eggs"); with the chip in a 320 px field only that fits on one line.
if (chip && w < 360) out.placeholder = "Eggs";
out.extraCls = (goalOn ? "goal-on " : "") + (chip ? "meal-chip " : "") + (chip && st.mealOpen ? "mopen " : "") + (FAST ? "pace-fast" : "");
// As today, the macro bars run the same way as the wheel: in "left" mode they show what is left.
if (ringMode !== "fills" && mode === "left") {
[["m1", "p", 140], ["m2", "c", 273], ["m3", "f", 61]].forEach(([key, k2, goal]) => {
const rest = Math.max(0, goal - sum(k2, n));
out[key].shift = "-" + (100 - Math.round((rest / goal) * 100)) + "%";
});
}
// Food rises from the field to where the arc ends, and fades into it.
const k = 264 / 160;
const fieldX = 110 - 16 - (w - 32 - 264) / 2;
const fieldY = w < 360 ? 562 : 516;
for (let i = 0; i < ADDS.length; i++) {
const a = 2 * Math.PI * fillAt(i);
const X = (80 + 74 * Math.sin(a)) * k;
const Y = (80 - 74 * Math.cos(a)) * k;
out["f" + (i + 1)] = { x: X.toFixed(0) + "px", y: Y.toFixed(0) + "px", fx: (fieldX - X).toFixed(0) + "px", fy: (fieldY - Y).toFixed(0) + "px" };
}
"""

D_PROPS = '"goal":{"editor":"enum","options":["on","off"],"default":"on","section":"From the research"},"meal":{"editor":"enum","options":["chip","track"],"default":"chip","section":"From the research"},"pace":{"editor":"enum","options":["0.6 s","0.9 s"],"default":"0.6 s","section":"From the research"},"ring":{"editor":"enum","options":["fills","as now"],"default":"fills","section":"The wheel"},"flight":{"editor":"boolean","default":true,"section":"The wheel"},'

D_BODY = part(HEADER) + part(D_HERO) + part(WEEK, 6) + part(MACROS, 8) + part(TRACK, 14) + part(FIELD, 8) + part(LOG, 14)

page("D-Wheel.dc.html", "Food, the pick: A's page with the calorie wheel", D_CSS, D_BODY, D_EXTRA, delay="(FAST ? 250 : 300)", ms="(FAST ? 350 : 600)", more_props=D_PROPS)
