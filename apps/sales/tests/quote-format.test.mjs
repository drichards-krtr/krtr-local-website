import test from "node:test";
import assert from "node:assert/strict";
import {centsFromInput,percentToBps,money,sumCents} from "../lib/quote-format.mjs";
test("currency forms preserve cents and reject rounding, exponents and unsafe integers",()=>{assert.equal(centsFromInput("14.29"),1429);assert.equal(centsFromInput("0.5"),50);for(const value of ["-1","1.001","1e3","NaN","90071992547409.92"])assert.throws(()=>centsFromInput(value));assert.equal(percentToBps("7.25"),725);assert.throws(()=>percentToBps("100.01"));assert.equal(money(null),"Not configured");});

test("aggregate cents retain precision beyond a single invoice safe integer",()=>{const total=sumCents([{c:9007199254740991},{c:9007199254740991}],"c");assert.equal(total,18014398509481982n);assert.equal(money(total),"$180,143,985,094,819.82");});
