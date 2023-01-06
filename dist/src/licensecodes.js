"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LicenseCodes = void 0;
exports.LicenseCodes = [
    {
        value: "apache_2",
        label: "Apache License 2.0",
    },
    {
        value: "gnu_general_public_3",
        label: "GNU General Public License v3.0",
    },
    {
        value: "mit",
        label: "MIT License",
    },
    {
        value: "bsd2_simplified",
        label: 'BSD 2-Clause "Simplified" License',
    },
    {
        value: "bsd3_new_or_revised",
        label: 'BSD 3-Clause "New" or "Revised" License',
    },
    {
        value: "boost",
        label: "Boost Software License",
    },
    {
        value: "creative_commons_zero_1_0",
        label: "Creative Commons Zero v1.0 Universal",
    },
    {
        value: "eclipse_2",
        label: "Eclipse Public License 2.0",
    },
    {
        value: "gnu_affero_3",
        label: "GNU Affero General Public License v3.0",
    },
    {
        value: "gnu_general_2",
        label: "GNU General Public License v2.0",
    },
    {
        value: "gnu_lesser_2_1",
        label: "GNU Lesser General Public License v2.1",
    },
    {
        value: "mozilla_2",
        label: "Mozilla Public License v2.0",
    },
    {
        value: "unlicense",
        label: "The Unlicense",
    },
].reduce((acc, { value, label }) => ({ ...acc, [value]: label }), {});
//# sourceMappingURL=licensecodes.js.map