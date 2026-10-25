/* SPDX-License-Identifier: AGPL-3.0-or-later

Copyright (c) 2026 Adrian Cruceru

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

#pragma once

#include <stdint.h>

#include <string_view>

#include "arm.h"
#include "command_table.h"

inline bool arm_next(std::string_view& args, std::string_view& piece)
{
    if (args.empty())
    {
        return false;
    }

    size_t split = args.find('/');

    if (split == std::string_view::npos)
    {
        piece = args;
        args = std::string_view();
    }
    else
    {
        piece = args.substr(0, split);
        args = args.substr(split + 1);
    }

    return !piece.empty();
}

inline bool arm_parse_int(std::string_view text, int32_t& value)
{
    if (text.empty() || (text.size() > 7))
    {
        return false;
    }

    bool negative = (text[0] == '-');

    if (negative || (text[0] == '+'))
    {
        text = text.substr(1);
    }

    if (text.empty())
    {
        return false;
    }

    int32_t number = 0;

    for (char digit : text)
    {
        if ((digit < '0') || (digit > '9'))
        {
            return false;
        }

        number = (number * 10) + (digit - '0');
    }

    value = negative ? -number : number;
    return true;
}

inline bool arm_parse_deci(std::string_view text, int32_t& deci)
{
    size_t dot = text.find('.');

    if (dot == std::string_view::npos)
    {
        int32_t whole = 0;

        if (!arm_parse_int(text, whole))
        {
            return false;
        }

        deci = whole * 10;
        return true;
    }

    std::string_view whole_text = text.substr(0, dot);
    std::string_view fraction_text = text.substr(dot + 1);

    bool negative = (!whole_text.empty() && (whole_text[0] == '-'));
    int32_t whole = 0;

    if (whole_text.empty() || (whole_text == "-") || (whole_text == "+"))
    {
        whole = 0;
    }
    else if (!arm_parse_int(whole_text, whole))
    {
        return false;
    }

    int32_t tenths = 0;

    if (!fraction_text.empty())
    {
        if ((fraction_text[0] < '0') || (fraction_text[0] > '9'))
        {
            return false;
        }

        tenths = fraction_text[0] - '0';
    }

    deci = (whole * 10) + (negative ? -tenths : tenths);
    return true;
}

inline bool arm_parse_joint(CommandContext& ctx, std::string_view text, int& found)
{
    found = ArmManager::get().find(text);

    if (found == ArmManager::NO_JOINT)
    {
        ctx.reply_fmt(144, "no joint [%.*s]: 1..%u, a name, or all",
                  (int)text.size(), text.data(), (unsigned int)ArmManager::count());
        return false;
    }

    return true;
}
