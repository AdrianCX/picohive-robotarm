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

#include <stdio.h>
#include <string.h>

#include "arm_args.h"
#include "pose.h"

bool PoseCommand::on_header(CommandContext& ctx)
{
    ArmManager& arm = ArmManager::get();
    std::string_view args = ctx.args;
    std::string_view what;

    if (!arm_next(args, what))
    {
        return ctx.reply_fmt((uint32_t)help.size(), "%.*s", (int)help.size(), help.data());
    }

    if (what == "stop")
    {
        arm.pose_stop();

        for (uint32_t index = 0; index < arm.count(); ++index)
        {
            arm.stop(index);
        }

        return ctx.reply("holding where it got to");
    }

    std::string_view pose_name;

    if (!arm_next(args, pose_name))
    {
        return ctx.reply_fmt(128, "expected pose/%.*s/<name>", (int)what.size(), what.data());
    }

    if (!PoseStore::is_name(pose_name))
    {
        return ctx.reply_fmt(64, "a name is 1 to %d letters, digits, - or _", POSE_NAME_MAX - 1);
    }

    std::string_view only_text;
    uint8_t only = 0xFF;

    if (arm_next(args, only_text))
    {
        only = 0;

        for (char c : only_text)
        {
            if ((c < '1') || (c > (char)('0' + arm.count())))
            {
                return ctx.reply_fmt(160, "[%.*s]? the joints as numbers 1 to %u, run together",
                                 (int)only_text.size(), only_text.data(), (unsigned int)arm.count());
            }

            only |= (uint8_t)(1u << (c - '1'));
        }
    }

    if (what == "save")
    {
        Pose taken;

        if (!arm.capture(taken))
        {
            return ctx.reply("nothing to save: no joint is plugged in, calibrated and read yet");
        }

        Pose *stored = arm.poses().add(pose_name);

        if (stored == NULL)
        {
            return ctx.reply_fmt(80, "no room for another pose, there are %d - delete one first", MAX_POSES);
        }

        stored->joints = taken.joints & only;

        uint32_t saved = 0;

        for (uint32_t index = 0; index < arm.count(); ++index)
        {
            stored->position[index] = taken.position[index];
            saved += stored->has(index) ? 1 : 0;
        }

        if (!arm.poses().save())
        {
            return ctx.reply_fmt(144, "[%.*s] taken, but the flash write failed",
                             (int)pose_name.size(), pose_name.data());
        }

        return ctx.reply_fmt(128, "[%.*s] saved, %u joints",
                         (int)pose_name.size(), pose_name.data(), (unsigned int)saved);
    }

    if (what == "load")
    {
        Pose *stored = arm.poses().find(pose_name);

        if (stored == NULL)
        {
            return ctx.reply_fmt(128, "there is no pose [%.*s]", (int)pose_name.size(), pose_name.data());
        }

        Pose going = *stored;
        going.joints &= only;

        if (!arm.pose_play(going))
        {
            return ctx.reply("cannot go there: no joint of that pose is plugged in and calibrated, "
                                   "or something is being calibrated right now");
        }

        return ctx.reply_fmt(112, "going to [%.*s]", (int)pose_name.size(), pose_name.data());
    }

    if (what == "delete")
    {
        if (!arm.poses().remove(pose_name))
        {
            return ctx.reply_fmt(128, "there is no pose [%.*s]", (int)pose_name.size(), pose_name.data());
        }

        return ctx.reply_fmt(208, "[%.*s] %s", (int)pose_name.size(), pose_name.data(),
                         arm.poses().save() ? "deleted" : "deleted, but the flash write failed");
    }

    return ctx.reply_fmt(128, "[%.*s]? save, load, delete or stop", (int)what.size(), what.data());
}

uint32_t PosesJson::line(uint32_t index, char *out, uint32_t size)
{
    ArmManager& arm = ArmManager::get();
    PoseStore& poses = arm.poses();
    int pos = 0;

    if (index == 0)
    {
        pos = snprintf(out, size, "{\"poses\":[");
    }
    else if (index > MAX_POSES)
    {
        pos = snprintf(out, size, "],\"max\":%d,\"going\":\"%s\"}", MAX_POSES, going);
    }
    else
    {
        const Pose *stored = poses.at(index - 1);

        if ((stored == NULL) || !stored->used)
        {
            return 0;
        }

        bool first = true;

        for (uint32_t before = 0; before < (index - 1); ++before)
        {
            first = first && !poses.at(before)->used;
        }

        pos = snprintf(out, size, "%s{\"n\":\"%s\",\"d\":\"%s\",\"joints\":%u,\"away\":%5u,\"pos\":[",
                       first ? "" : ",", stored->name, stored->description, (unsigned int)stored->joints,
                       (unsigned int)arm.pose_distance(*stored));

        for (uint32_t joint = 0; (joint < arm.count()) && (pos > 0) && (pos < (int)size); ++joint)
        {
            pos += snprintf(&out[pos], size - pos, "%s%u", (joint > 0) ? "," : "",
                            stored->has(joint) ? (unsigned int)stored->position[joint] : 0u);
        }

        if ((pos > 0) && (pos < (int)size))
        {
            pos += snprintf(&out[pos], size - pos, "],\"o\":\"");
        }

        if ((pos > 0) && (pos < (int)size))
        {
            pos += snprintf(&out[pos], size - pos, "\"}");
        }
    }

    return (pos <= 0) ? 0 : (((uint32_t)pos < size) ? (uint32_t)pos : size - 1);
}

bool PosesCommand::on_header(CommandContext& ctx)
{
    ArmManager& arm = ArmManager::get();
    snprintf(m_json.going, sizeof(m_json.going), "%s", arm.is_playing() ? arm.playing().name : "");

    return m_json.begin(ctx, name);
}

bool PoseDescribe::on_payload(CommandContext& ctx, std::string_view body)
{
    std::string_view args = ctx.args;
    std::string_view pose_name;

    if (!arm_next(args, pose_name))
    {
        return ctx.reply_fmt((uint32_t)help.size(), "%.*s", (int)help.size(), help.data());
    }

    Pose *stored = ArmManager::get().poses().find(pose_name);

    if (stored == NULL)
    {
        return ctx.reply_fmt(112, "no pose [%.*s]", (int)pose_name.size(), pose_name.data());
    }

    std::string_view text = body.empty() ? args : body;

    if (text.empty())
    {
        return ctx.reply_fmt(208, "[%s]: %s", stored->name, (stored->description[0] != 0) ? stored->description : "(no description)");
    }

    if (!ArmManager::get().poses().describe(*stored, (text == "-") ? std::string_view() : text))
    {
        return ctx.reply_fmt(144, "[%s] described, but the flash write failed", stored->name);
    }

    return ctx.reply_fmt(208, "[%s]: %s", stored->name, (stored->description[0] != 0) ? stored->description : "(no description)");
}

MQTT_COMMAND(PoseDescribe);
WS_COMMAND(PoseDescribe);
TELEGRAM_COMMAND(PoseDescribe);
AI_COMMAND(PoseDescribe);

MQTT_COMMAND(PoseCommand);
WS_COMMAND(PoseCommand);
TELEGRAM_COMMAND(PoseCommand);
CALENDAR_COMMAND(PoseCommand);

MQTT_COMMAND(PosesCommand);
WS_COMMAND(PosesCommand);
AI_COMMAND(PosesCommand);
