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

#include <string.h>

#include "common_functions.h"
#include "listener.h"
#include "tls_listener.h"
#include "pico_logger.h"
#include "session.h"

#include "app_config.h"
#include "arm.h"
#include "chassis.h"
#include "command_request_handler.h"
#include "general_config.h"
#include "openai_agent.h"
#include "openai_manager.h"
#include "openai_sequence.h"
#include "wifi.h"

#include "rc/index.html.gz.hex.h"

#define MAGIC_WIFI_FAILED 0xdeadbeef
uint32_t __uninitialized_ram(last_boot_status);

bool failed_wifi = false;

void on_boot()
{
    failed_wifi = (last_boot_status == MAGIC_WIFI_FAILED);

    last_boot_status = 0;

    ArmManager::get().initialize();

    Chassis::get().initialize();

    AiSequence::get().set_ready([]() { return ArmManager::get().settled(); });
    OpenAIAgent::get().set_app_instructions(
        "It is a robot arm; each step starts once the arm has stopped moving. "
        "Move only with joints/<pan>/<lift>/<elbow>/<wrist>/<roll>/<grip> in degrees, - for a joint left as it is; "
        "never load a pose. Saved poses are only there to read: poses/where gives each one's joints to copy or adjust.");
}

bool is_access_point()
{
    return (get_config().wifi_ssid[0] == 0);
}

void on_wifi_failed()
{
    last_boot_status = MAGIC_WIFI_FAILED;
}

bool on_wifi_ready()
{
    Session::create_client_tls_config(NULL, 0);

    CommandRequestHandler::set_config(__rc_index_html_gz, __rc_index_html_gz_len);
    Listener *listener = new Listener();
    listener->listen(80, CommandRequestHandler::create);

    if (!is_access_point())
    {
        CommandRequestHandler::require_auth(true);

        TLSListener *tls_listener = new TLSListener();
        tls_listener->listen(443, CommandRequestHandler::create);
    }

    return true;
}

void on_update(uint64_t now_us)
{
    ArmManager::get().update(now_us);

    Chassis::get().update(now_us);

    OpenAIManager::get().update(now_us);
}

void on_config_update(const JsonView& config)
{
    OpenAIManager::get().load_config(config);
}

void get_app_info(AppConfig *config)
{
    config->on_boot = on_boot;
    config->access_point = is_access_point;
    config->on_wifi_failed = on_wifi_failed;
    config->on_wifi_ready = on_wifi_ready;
    config->on_update = on_update;
    config->on_config_update = on_config_update;

    config->name = "build/" PICO_BOARD "/robotarm";
    config->version = "1.0";

    config->watchdog_timeout = 0;
}
