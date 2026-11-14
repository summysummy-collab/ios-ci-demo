#!/usr/bin/env python3
"""生成安装页的数据文件：<site>/<slug>/ota.json 与 manifest.plist

为什么单独抽出来：
  * jq 的表达式只能在 CI 里试，写错了要等五分钟才知道；这个脚本本地就能跑。
  * manifest.plist 用 plistlib 生成，不用手拼 XML（手拼最容易漏闭合标签，
    而 iOS 那边只会静默失败，看不出原因）。
  * 页面只读 json，所以「改文案 / 加历史」都不需要动 html。

用法示例：
  python3 tools/ota_json.py --site site --slug bigorder-rokid \
    --name "大单监控 · 乐奇版" --label 乐奇版 --subtitle "自选股盯盘 + 乐奇眼镜副屏" \
    --bundle-id com.bigorder.monitor --version 2.6.1 --build 52 \
    --ipa-url https://example.com/a.ipa --size 994570 --sha256 abc... \
    --profile-name bigorder --devices 1 --expires 2027-11-12
"""
import argparse
import json
import os
import plistlib
import sys
import time


def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def pick_notes(slug_dir, version):
    """notes.json 里按版本取，取不到退回 default。缺文件就是空数组。"""
    data = load_json(os.path.join(slug_dir, "notes.json")) or {}
    versions = data.get("versions") or {}
    notes = versions.get(str(version))
    if notes is None:
        notes = data.get("default") or []
    return list(notes)


def merge_history(old, current, keep=8):
    """新的排最前，按 版本号/build 去重，保持新→旧的顺序（不排序）。"""
    out, seen = [], set()
    for item in [current] + list((old or {}).get("history") or []):
        if not item or not item.get("versionName"):
            continue
        key = (str(item.get("versionName")), str(item.get("versionCode")))
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
        if len(out) >= keep:
            break
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--site", required=True, help="站点根目录（含 <slug>/）")
    p.add_argument("--slug", required=True)
    p.add_argument("--name", required=True)
    p.add_argument("--label", required=True)
    p.add_argument("--subtitle", default="")
    p.add_argument("--bundle-id", required=True)
    p.add_argument("--min-os", default="16.0")
    p.add_argument("--version", required=True)
    p.add_argument("--build", required=True)
    p.add_argument("--ipa-url", required=True, help="ipa 的绝对地址，写进 manifest.plist")
    p.add_argument("--size", type=int, default=0)
    p.add_argument("--sha256", default="")
    p.add_argument("--profile-name", default="")
    p.add_argument("--devices", type=int, default=0)
    p.add_argument("--expires", default="")
    p.add_argument("--run-url", default="")
    p.add_argument("--agent-file", default="")
    p.add_argument("--agent-size", type=int, default=0)
    p.add_argument("--agent-url", default="")
    p.add_argument("--agent-version", default="",
                   help="智能体自己的版本号（默认跟随 App 版本）。眼镜端就是拿它比「是否最新」，"
                        "必须等于 aiui-agent/lib/version.js 里的 AGENT_VERSION")
    p.add_argument("--agent-local", action="store_true",
                   help=".aix 跟页面放同一目录，走相对路径直下")
    p.add_argument("--agent-page", default="pages/quotes/index")
    p.add_argument("--agent-notes", default="", help="一句话说明，逗号分隔")
    p.add_argument("--generated-at", default="")
    args = p.parse_args()

    slug_dir = os.path.join(args.site, args.slug)
    os.makedirs(slug_dir, exist_ok=True)

    now = args.generated_at or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    notes = pick_notes(slug_dir, args.version)

    current = {
        "versionName": args.version,
        "versionCode": args.build,
        "releasedAt": now,
        "url": args.ipa_url,
        "size": args.size,
        "sha256": args.sha256,
        "notes": notes,
    }

    old = load_json(os.path.join(slug_dir, "ota.json"))
    history = merge_history(old, current)

    doc = {
        "schema": 1,
        "channel": "development",
        "generatedAt": now,
        "runURL": args.run_url,
        "app": {
            "id": args.slug,
            "name": args.name,
            "label": args.label,
            "subtitle": args.subtitle,
            "bundleId": args.bundle_id,
            "platform": "ios",
            "minOs": args.min_os,
        },
        "install": {"type": "ios-ota", "manifest": "manifest.plist"},
        "latest": dict(current, signing={
            "type": "development",
            "profileName": args.profile_name,
            "devices": args.devices,
            "expiresAt": args.expires,
        }),
        "history": history,
    }

    if args.agent_file:
        doc["agent"] = {
            "name": "AIUI 智能体「自选盯盘」",  # 必须与 app.json 的 agentName 一致，语音只认这个名字
            "file": args.agent_file,
            "size": args.agent_size,
            # 智能体独立迭代：眼镜端顶栏显示的版本号跟自己比，
            # 这里要是只跟着 App 版本走，智能体改了版本也看不出该不该更新
            "version": args.agent_version or args.version,
            "page": args.agent_page,
            "url": args.agent_url,
            "local": bool(args.agent_local),
            "notes": [s.strip() for s in args.agent_notes.split(",") if s.strip()],
        }

    with open(os.path.join(slug_dir, "ota.json"), "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")

    # itms-services 真正读的是这个 plist，ipa 地址必须是绝对路径
    manifest = {
        "items": [{
            "assets": [{"kind": "software-package", "url": args.ipa_url}],
            "metadata": {
                "bundle-identifier": args.bundle_id,
                "bundle-version": args.version,
                "kind": "software",
                "title": args.name,
                "subtitle": "%s (%s)" % (args.version, args.build),
            },
        }]
    }
    with open(os.path.join(slug_dir, "manifest.plist"), "wb") as f:
        plistlib.dump(manifest, f)

    # 旧的 latest.json 换成 ota.json 了，留着会两套数据打架
    legacy = os.path.join(slug_dir, "latest.json")
    if os.path.exists(legacy):
        os.remove(legacy)

    print("ota.json 已写入 %s（版本 %s / b%s，历史 %d 条）"
          % (slug_dir, args.version, args.build, len(history)))
    print("manifest.plist -> %s" % args.ipa_url)


if __name__ == "__main__":
    sys.exit(main())
