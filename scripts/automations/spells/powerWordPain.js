export async function powerWordPain({ speaker, actor, token, character, item, args, scope, workflow, options, macroItem }) {
    if(args[0].macroPass === "postPreambleComplete") {
        const targets = workflow.targets;
        for(let target of targets) {
            if(target.actor.system.attributes.hp.value > 100 || target.actor.system.traits.ci.value.has("charmed")) {
                ui.notifications.warn("The target has more than 100 hit points or is immune to Charmed.");
                continue;
            }
            else {
                let gmUser = game.gps.getPrimaryGM();
                let effectData = [
                {
                    "name": item.name,
                    "origin": item.uuid,
                    "duration": {
                        "seconds": 99999
                    },
                    "disabled": false,
                    "img": item.img,
                    "changes": [
                        {
                            "key": "macro.itemMacro",
                            "mode": 0,
                            "value": "function.game.gps.powerWordPain @itemUuid",
                            "priority": 20
                        },
                        {
                            "key": "system.attributes.movement.all",
                            "mode": 0,
                            "value": "10",
                            "priority": 90
                        },
                        {
                            "key": "flags.midi-qol.disadvantage.attack.all",
                            "mode": 2,
                            "value": "1",
                            "priority": 20
                        },
                        {
                            "key": "flags.midi-qol.disadvantage.ability.check.all",
                            "mode": 2,
                            "value": "1",
                            "priority": 20
                        },
                        {
                            "key": "flags.midi-qol.disadvantage.ability.save.cha",
                            "mode": 2,
                            "value": "1",
                            "priority": 20
                        },
                        {
                            "key": "flags.midi-qol.disadvantage.ability.save.dex",
                            "mode": 2,
                            "value": "1",
                            "priority": 20
                        },
                        {
                            "key": "flags.midi-qol.disadvantage.ability.save.int",
                            "mode": 2,
                            "value": "1",
                            "priority": 20
                        },
                        {
                            "key": "flags.midi-qol.disadvantage.ability.save.str",
                            "mode": 2,
                            "value": "1",
                            "priority": 20
                        },
                        {
                            "key": "flags.midi-qol.disadvantage.ability.save.wis",
                            "mode": 2,
                            "value": "1",
                            "priority": 20
                        },
                        {
                            "key": "flags.midi-qol.onUseMacroName",
                            "mode": 0,
                            "value": "function.game.gps.powerWordPain, prePreambleComplete",
                            "priority": 20
                        }
                    ],
                    "transfer": false,
                    "flags": {
                        "dae": {
                            "macroRepeat": "endEveryTurn",
                            "selfTarget": false,
                            "selfTargetAlways": false,
                            "dontApply": false
                        },
                        "gambits-premades": {
                            "gpsUuid": "8f94b11e-3c8b-49c3-ae73-07c3e03670de"
                        }
                    }
                }];

                await MidiQOL.socket().executeAsUser("createEffects", gmUser, { actorUuid: target.actor.uuid, effects: effectData });
            }
        }
    }
    else if(args[0].macroPass === "prePreambleComplete") {
        if(workflow.item.type !== "spell") return;
        let gmUser = game.gps.getPrimaryGM();
        let saveRoll = await game.gps.socket.executeAsUser("gpsActivityUse", gmUser, {itemUuid: macroItem.uuid, identifier: "syntheticSave", targetUuid: token.document.uuid});
        if(saveRoll?.failedSaves?.size !== 0) {
            workflow.aborted = true;
            ui.notifications.warn("You were unable to save, your spell fails and is wasted.");
        }
    }
    else if (args[0] === "each" && args[3].turn === "endTurn") {
        item = await fromUuid(args[2]);
        let gmUser = game.gps.getPrimaryGM();
        let saveRoll = await game.gps.socket.executeAsUser("gpsActivityUse", gmUser, {itemUuid: item.uuid, identifier: "syntheticSave", targetUuid: token.document.uuid});
        if(saveRoll?.failedSaves?.size === 0) {
            let effectData = await token.actor.appliedEffects.find(e => e.flags["gambits-premades"]?.gpsUuid === "8f94b11e-3c8b-49c3-ae73-07c3e03670de");
            await effectData.delete();
        }
    }
}