import { ServerDTO } from "../models/ServerDTO";
import { UtilsService } from "./UtilsService";
import { GlobalEventDTO } from "../models/GlobalEventDTO";
import { window, workspace, Uri } from "vscode";
import { ServerService } from "./ServerService";
import { basename } from "path";
import { readFileSync } from "fs";

const basePath = "/ecm/api/rest/ecm/globalevent/";

export class GlobalEventService {
    private static getBasePath(server: ServerDTO, action: string): string {
        const host = UtilsService.getHost(server);
        return `${host}${basePath}${action}?username=${encodeURIComponent(server.username)}&password=${encodeURIComponent(server.password)}`;
    }

    /**
     * Retorna uma lista com todos os eventos globais
     */
    private static async getEventList(server: ServerDTO): Promise<GlobalEventDTO[]> {
        const endpoint = GlobalEventService.getBasePath(server, "getEventList");

        try {
            const response:any = await fetch(
                endpoint,
                { headers: { "Accept": "application/json" } }
            ).then(r => r.json());

            if (response.message) {
                window.showErrorMessage(response.message.message);
                return [];
            }

            return response;
        } catch (error) {
            window.showErrorMessage("Erro: " + error);
        }

        return [];
    }

    private static async saveEventList(server: ServerDTO, globalEvents: GlobalEventDTO[]) {
        const requestOptions = {
            method: 'post',
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: JSON.stringify(globalEvents),
        };

        try {
            return await fetch(GlobalEventService.getBasePath(server, "saveEventList"), requestOptions).then(r => r.json());
        } catch (error) {
            window.showErrorMessage("Erro: " + error);
        }
    }

    /**
     * Retorna o evento global selecionado
     */
    private static async getOptionSelected(server: ServerDTO): Promise<GlobalEventDTO | undefined> {
        const eventList = await GlobalEventService.getEventList(server);
        const items = eventList.map(event => ({ label: event.globalEventPK.eventId }));
        const result = await window.showQuickPick(items, {
            placeHolder: "Selecione o evento"
        });

        if (!result) {
            return;
        }

        return eventList.find(event => {return event.globalEventPK.eventId === result.label});
    }

    /**
     * Retorna o evento global selecionado
     */
    private static async getOptionsSelected(server: ServerDTO): Promise<GlobalEventDTO[] | undefined> {
        const eventList = await GlobalEventService.getEventList(server);
        const items = eventList.map(event => ({ label: event.globalEventPK.eventId }));
        const result = await window.showQuickPick(items, {
            placeHolder: "Selecione os eventos",
            canPickMany: true
        });

        if (!result) {
            return;
        }

        const retEventList: GlobalEventDTO[] = [];
        for(let item of result) {
            for(let event of eventList) {
                if(event.globalEventPK.eventId === item.label) {
                    retEventList.push(event);
                }
            }
        }

        return retEventList;
    }

    /**
     * Realiza a importação de um evento global
     */
    public static async import() {
        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        const event = await GlobalEventService.getOptionSelected(server);

        if (!event) {
            return;
        }

        GlobalEventService.saveFile(
            event.globalEventPK.eventId,
            event.eventDescription
        );
    }

    /**
     * Realiza a importação de vários eventos globais
     */
    public static async importMany() {
        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        const eventList = await GlobalEventService.getOptionsSelected(server);

        if (!eventList) {
            return;
        }

        eventList.map(async event => {
            GlobalEventService.saveFile(
                event.globalEventPK.eventId,
                event.eventDescription
            );
        });
    }

    public static async export(fileUri: Uri) {
        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        const globalEvents = await GlobalEventService.getEventList(server);
        const globalEventId: string = basename(fileUri.fsPath, '.js');

        const globalEventStructure: GlobalEventDTO = {
            globalEventPK: {
                companyId: server.companyId,
                eventId: globalEventId
            },
            eventDescription: readFileSync(fileUri.fsPath, 'utf8')
        };

        const index = globalEvents.findIndex(globalEvent => globalEvent.globalEventPK.eventId === globalEventId);

        if (index === -1) {
            globalEvents.push(globalEventStructure);
        } else {
            globalEvents[index] = globalEventStructure;
        }

        let result: any = undefined;

        // Validar senha antes de exportar
        if (server.confirmExporting && !(await UtilsService.confirmPassword(server))) {
            return;
        }

        result = await GlobalEventService.saveEventList(server, globalEvents);

        if (result.content === 'OK') {
            window.showInformationMessage("Evento Global " + globalEventId + " exportado com sucesso!");
        } else {
            window.showErrorMessage("Falha ao exportar o Evento Global " + globalEventId + "!" + result?.message?.message);
        }
    }

    public static async delete() {
        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        const eventList = await GlobalEventService.getOptionsSelected(server);

        if (!eventList) {
            return;
        }

        const endpoint = GlobalEventService.getBasePath(server, "deleteGlobalEvent");

        eventList.forEach(async event => {
            const result:any = await fetch(
                endpoint + `&eventName=${event.globalEventPK.eventId}`,
                { method: "DELETE",  headers: { "Accept": "application/json" } }
            ).then(r => r.json());

            if (result.content === "OK") {
                window.showInformationMessage("Evento Global " + event.globalEventPK.eventId + " removido com sucesso!");
            } else {
                window.showErrorMessage("Erro ao remover Evento Global " + event.globalEventPK.eventId + "! " + result.message.message);
            }
        });
    }

    /**
     * Criar arquivo de evento global
     */
     public static async saveFile(name: string, content: string) {
        const uri = Uri.joinPath(UtilsService.getWorkspaceUri(), "events", name + ".js");

        await workspace.fs.writeFile(
            uri,
            Buffer.from(content, "utf-8")
        );

        window.showInformationMessage("Evento global " + name + " importado com sucesso!");
    }
}
