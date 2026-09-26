import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const markdown=require("../card-markdown.js");

assert.equal(markdown.render("# 标题\n\n一段 **重要** 的文字。"),"<h1>标题</h1><p>一段 <strong>重要</strong> 的文字。</p>");
assert.equal(markdown.render("- 甲\n- 乙\n\n> 引用"),"<ul><li>甲</li><li>乙</li></ul><blockquote>引用</blockquote>");
assert.equal(markdown.render("<img src=x onerror=alert(1)>"),"<p>&lt;img src=x onerror=alert(1)&gt;</p>");
assert.ok(markdown.render("[安全](https://example.com?a=1&b=2)").includes('rel="noopener noreferrer"'));
assert.ok(!markdown.render("[危险](javascript:alert(1))").includes("<a"));
assert.deepEqual(markdown.insert("abc",0,3,"bold"),{value:"**abc**",start:2,end:5});
assert.deepEqual(markdown.insert("abc",1,1,"h2"),{value:"## abc",start:4,end:4});
assert.equal(markdown.plainText(markdown.RICH_PREFIX+'<p>彩色<strong style="color:#ff0000">正文</strong></p>'),"彩色正文");

console.log("卡片 Markdown 阅读和工具栏基础测试通过");
