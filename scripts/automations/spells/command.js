export async function command({ speaker, actor, token, character, item, args, scope, workflow, options }) {
    if(args[0].macroPass === "postSavesComplete" && workflow.failedSaves) {
        let targets = workflow.failedSaves;
        console.log(workflow, "this ran workflow")
        console.log(args[0], "args0")

        await foundry.applications.api.DialogV2.wait({
            window: { title: '🗣Command🗣' },
            content: `
                <div class="gps-dialog-container">
                    <div class="gps-dialog-section">
                        <div class="gps-dialog-content">
                            <p class="gps-dialog-paragraph">What would you like to command?</p>
                            <div>
                                <div class="gps-dialog-flex">
                                    <div style='width: 100%; text-align: center;'>
                                        <input type="text" name="wordInput" id="wordInput" maxlength = "10" autofocus></input>
                                    </div>
                                    <div id="image-container" class="gps-dialog-image-container">
                                        <img src="${workflow.item.img}" class="gps-dialog-image">
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `,
            buttons: [{
                action: "Cast",
                label: "Cast",
                default: true,
                callback: async (event, button, dialog) => {
                    let wordInput = document.querySelector('#wordInput').value;
                    for (let target of targets) {
                        await MidiQOL.socket().executeAsGM('_gmSetFlag', { actorUuid : target.actor.uuid, base : 'gambits-premades', key : 'commandWord', value : wordInput })
                    }
                }
            }],
            close: async (event, dialog) => {
                return;
            }, rejectClose:false
        });
    }
    else if(args[0] === "off") {
        let wordInput = await actor.getFlag("gambits-premades", "commandWord")
        let content = `${actor.name} must now ${wordInput}.`;
        let actorPlayer = MidiQOL.playerForActor(actor);
        let chatData = {
            user: actorPlayer.id,
            speaker: ChatMessage.getSpeaker({ token: token }),
            content: content
        };
        ChatMessage.create(chatData);

        const style = {
            "fill": "#ffffff",
            "fontFamily": "Helvetica",
            "fontSize": 50,
            "strokeThickness": 0,
            fontWeight: "bold"
        }

        let delay = 0;
        const delayIncrement = 500;

        wordInput.split('').forEach((char, index) => {
            new Sequence()
                .effect()
                .atLocation(token, {
                    offset: { x: index * 0.35 - (wordInput.length - 1) * 0.18, y: -0.7 * token.document.height },
                    randomOffset: 0.1,
                    gridUnits: true
                })
                .text(char, style)
                .delay(delay)
                .duration(6000)
                .fadeOut(1500)
                .animateProperty("sprite", "position.y", {
                    from: -1.5 * token.document.height,
                    to: -0.2 * token.document.height,
                    duration: 2000,
                    gridUnits: true,
                    ease: "easeInExpo"
                })
                .scaleIn(0, 1500, { ease: "easeOutElastic" })
                .filter("Glow", { color: 0x4169E1 })
                .zIndex(100 + index)
                .play();

            delay += delayIncrement;
        });

        MidiQOL.socket().executeAsGM('_gmUnsetFlag', { actorUuid : actor.uuid, base : 'gambits-premades', key : 'commandWord' })
    }
}