import Foundation

public final class GameRPCService: @unchecked Sendable {
    public let store: SQLiteSnapshotStore
    private let requiredCapabilityKey: String?
    private let codexLink: CodexLinkControlling?

    public init(
        store: SQLiteSnapshotStore,
        requiredCapabilityKey: String? = nil,
        codexLink: CodexLinkControlling? = nil
    ) {
        self.store = store
        self.requiredCapabilityKey = requiredCapabilityKey
        self.codexLink = codexLink
    }

    public func handle(line: Data) -> Data {
        var responseID: Any?
        do {
            guard let request = try JSONSerialization.jsonObject(with: line) as? [String: Any] else {
                return response(id: nil, ok: false, error: "invalid-request", message: "Request must be a JSON object.")
            }
            let id = request["id"]
            responseID = id
            guard let method = (request["method"] ?? request["op"]) as? String else {
                return response(id: id, ok: false, error: "invalid-request", message: "Missing method.")
            }
            if let requiredCapabilityKey,
               request["auth"] as? String != requiredCapabilityKey {
                return response(id: id, ok: false, error: "unauthorized", message: "Invalid local capability key.")
            }
            let params = request["params"] as? [String: Any] ?? [:]

            switch method {
            case "snapshot", "monster_expedition_open":
                return success(id: id, result: try snapshotObject(store.load()))
            case "sync", "monster_expedition_sync":
                return try handleSync(id: id, params: params)
            case "act", "monster_expedition_act":
                return try handleAct(id: id, params: params)
            case "preferences", "monster_expedition_preferences":
                return try handlePreferences(id: id, params: params)
            case "diagnostics", "monster_expedition_export_diagnostics":
                return try handleDiagnostics(id: id)
            default:
                return response(id: id, ok: false, error: "method-not-found", message: "Unknown method: \(method)")
            }
        } catch {
            return response(id: responseID, ok: false, error: "internal-error", message: error.localizedDescription)
        }
    }

    private func handleSync(id: Any?, params: [String: Any]) throws -> Data {
        let newTokens = max(0, integer(params["newTokens"] ?? params["tokens"]) ?? 0)
        let suppliedElapsed = integer(params["elapsedSeconds"])
        let commandID = params["commandId"] as? String
        let expectedRevision = integer(params["expectedRevision"])
        let outcome = try store.mutate(commandID: commandID, expectedRevision: expectedRevision) { snapshot in
            let now = Date()
            let elapsedSeconds = max(
                0,
                min(
                    43_200,
                    suppliedElapsed ?? Int(now.timeIntervalSince(snapshot.lastSyncedAt))
                )
            )
            simulate(snapshot: &snapshot, seconds: elapsedSeconds)
            snapshot.lastSyncedAt = now

            if let rawWorkState = params["workState"] as? String,
               let workState = WorkState(rawValue: rawWorkState) {
                snapshot.workState = workState
                snapshot.workUpdatedAt = now
            }

            guard snapshot.bondCharges < GameSnapshot.maximumBondCharges else { return }
            var progress = snapshot.tokenProgress + newTokens
            while progress >= GameSnapshot.tokenThreshold,
                  snapshot.bondCharges < GameSnapshot.maximumBondCharges {
                progress -= GameSnapshot.tokenThreshold
                snapshot.bondCharges += 1
                snapshot.petState = .bondReady
            }
            snapshot.tokenProgress = snapshot.bondCharges == GameSnapshot.maximumBondCharges ? 0 : progress
        }
        return mutationResponse(id: id, outcome: outcome)
    }

    private func handleAct(id: Any?, params: [String: Any]) throws -> Data {
        let commandID = params["commandId"] as? String
        let expectedRevision = integer(params["expectedRevision"])
        let action = (params["action"] as? [String: Any]) ?? params
        guard let type = action["type"] as? String else {
            return response(id: id, ok: false, error: "invalid-action", message: "Missing action type.")
        }

        let outcome = try store.mutate(commandID: commandID, expectedRevision: expectedRevision) { snapshot in
            switch type {
            case "setPetState":
                guard let rawState = action["state"] as? String,
                      let state = PetState(rawValue: rawState) else {
                    throw ServiceError.invalidParameter("state")
                }
                snapshot.petState = state
            case "consumeBond":
                guard snapshot.bondCharges > 0 else {
                    throw ServiceError.noBondCharge
                }
                snapshot.bondCharges -= 1
                snapshot.pendingRewards += 1
                snapshot.petState = .bursting
            case "completeBurst":
                snapshot.petState = snapshot.pendingRewards > 0 ? .rewardReady : .traveling
            case "claimReward":
                guard snapshot.pendingRewards > 0 else {
                    throw ServiceError.noPendingReward
                }
                snapshot.pendingRewards -= 1
                snapshot.gearMaterials += 1
                snapshot.petState = snapshot.pendingRewards > 0 ? .rewardReady : .traveling
            case "setLeadMonster":
                guard let monsterID = action["monsterId"] as? String, !monsterID.isEmpty else {
                    throw ServiceError.invalidParameter("monsterId")
                }
                snapshot.leadMonsterID = monsterID
            case "setPartnerMonster":
                snapshot.partnerMonsterID = action["monsterId"] as? String
            case "set_team":
                guard let leadMonsterID = action["leadMonsterId"] as? String, !leadMonsterID.isEmpty else {
                    throw ServiceError.invalidParameter("leadMonsterId")
                }
                snapshot.leadMonsterID = leadMonsterID
                let monsterIDs = action["monsterIds"] as? [String] ?? []
                snapshot.partnerMonsterID = monsterIDs.first(where: { $0 != leadMonsterID })
            case "attempt_befriend":
                // The first companion is deliberately generous: the Panel gives
                // players the clear, early two-monster power spike they expect.
                if snapshot.partnerMonsterID == nil {
                    snapshot.partnerMonsterID = "swiftwing"
                    snapshot.trainerXP += 120
                }
            case "unlock_trainer_node":
                guard let nodeID = action["nodeId"] as? String else {
                    throw ServiceError.invalidParameter("nodeId")
                }
                if nodeID == "dual-command" && snapshot.partnerMonsterID == nil {
                    snapshot.partnerMonsterID = "swiftwing"
                }
                snapshot.trainerXP += 18
            case "upgrade_gear":
                guard snapshot.gearMaterials >= 5 else { throw ServiceError.insufficientMaterials }
                snapshot.gearMaterials -= 5
                snapshot.trainerXP += 25
            case "lock_gear":
                // Lock state is intentionally UI-only in the lightweight demo;
                // accepting the command preserves idempotent Panel interaction.
                break
            case "unlock_camp_node":
                let cost = max(0, integer(action["cost"]) ?? 100)
                guard snapshot.gold >= cost else { throw ServiceError.insufficientGold }
                snapshot.gold -= cost
                snapshot.gearMaterials += 1
            case "choose_reward":
                guard snapshot.pendingRewards > 0 else { throw ServiceError.noPendingReward }
                snapshot.pendingRewards -= 1
                snapshot.gearMaterials += 2
                snapshot.petState = snapshot.pendingRewards > 0 ? .rewardReady : .traveling
            case "setCodexLinkState":
                guard let rawState = action["state"] as? String,
                      let state = CodexLinkState(rawValue: rawState) else {
                    throw ServiceError.invalidParameter("state")
                }
                snapshot.codexLinkState = state
                if state == .unavailable {
                    snapshot.petState = .linkUnavailable
                }
            case "simulateOfflineReturn":
                let seconds = min(43_200, max(0, integer(action["seconds"]) ?? 0))
                let effective = Int(Double(seconds) * 0.8)
                simulate(snapshot: &snapshot, seconds: effective)
                snapshot.petState = .offlineReturn
            default:
                throw ServiceError.unknownAction(type)
            }
        }
        return mutationResponse(id: id, outcome: outcome)
    }

    private func handlePreferences(id: Any?, params: [String: Any]) throws -> Data {
        let commandID = params["commandId"] as? String
        let expectedRevision = integer(params["expectedRevision"])
        let patch = params["preferences"] as? [String: Any] ?? params
        let requestedLinkAction = patch["codexLinkAction"] as? String
        let linkStatus: CodexLinkStatus?
        switch requestedLinkAction {
        case "authorize": linkStatus = try codexLink?.authorize()
        case "disconnect": linkStatus = try codexLink?.disconnect()
        default: linkStatus = nil
        }
        let outcome = try store.mutate(commandID: commandID, expectedRevision: expectedRevision) { snapshot in
            if let rawLocale = patch["locale"] as? String {
                guard let locale = Locale(rawValue: rawLocale) else {
                    throw ServiceError.invalidParameter("locale")
                }
                snapshot.preferences.locale = locale
            }
            if let reducedMotion = patch["reducedMotion"] as? Bool {
                snapshot.preferences.reducedMotion = reducedMotion
            }
            if let muted = patch["muted"] as? Bool {
                snapshot.preferences.muted = muted
            }
            if let soundEnabled = patch["soundEnabled"] as? Bool {
                snapshot.preferences.muted = !soundEnabled
            }
            if let linkStatus {
                snapshot.codexLinkState = linkStatus.state
            } else if let action = requestedLinkAction {
                switch action {
                case "authorize": snapshot.codexLinkState = .restartRequired
                case "disconnect": snapshot.codexLinkState = .notConfigured
                default: break
                }
            }
        }
        return mutationResponse(id: id, outcome: outcome)
    }

    private func handleDiagnostics(id: Any?) throws -> Data {
        let snapshot = try store.load()
        let result: [String: Any] = [
            "schemaVersion": 1,
            "revision": snapshot.revision,
            "routeId": snapshot.routeID,
            "petState": snapshot.petState.rawValue,
            "codexLinkState": snapshot.codexLinkState.rawValue,
            "bondCharges": snapshot.bondCharges,
            "tokenProgress": snapshot.tokenProgress,
            "pendingRewards": snapshot.pendingRewards,
            "workState": snapshot.workState?.rawValue ?? WorkState.idle.rawValue,
            "locale": snapshot.preferences.locale.rawValue,
            "databaseFilename": store.databaseURL.lastPathComponent,
            "containsConversationContent": false
        ]
        return success(id: id, result: result)
    }

    private func mutationResponse(id: Any?, outcome: MutationResult) -> Data {
        switch outcome {
        case .applied(let snapshot):
            success(id: id, result: ["status": "applied", "snapshot": snapshotObject(snapshot)])
        case .duplicate(let snapshot):
            success(id: id, result: ["status": "duplicate", "snapshot": snapshotObject(snapshot)])
        case .conflict(let snapshot):
            response(
                id: id,
                ok: false,
                error: "revision-conflict",
                message: "Snapshot revision has changed.",
                extra: ["snapshot": snapshotObject(snapshot)]
            )
        }
    }

    private func snapshotObject(_ snapshot: GameSnapshot) -> [String: Any] {
        let data = try? SnapshotCoding.encoder().encode(snapshot)
        return (data.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]) ?? [:]
    }

    private func integer(_ value: Any?) -> Int? {
        if let number = value as? NSNumber { return number.intValue }
        if let string = value as? String { return Int(string) }
        return nil
    }

    private func simulate(snapshot: inout GameSnapshot, seconds: Int) {
        guard seconds > 0 else { return }
        let beforeWave = snapshot.expeditionSeconds / 6
        snapshot.expeditionSeconds += seconds
        snapshot.gold += seconds / 4
        snapshot.trainerXP += seconds * (snapshot.partnerMonsterID == nil ? 1 : 2)
        snapshot.gearMaterials += seconds / 45

        let afterWave = snapshot.expeditionSeconds / 6
        let crossedElite = beforeWave / 5 < afterWave / 5
        if snapshot.petState == .bursting {
            snapshot.petState = .rewardReady
        } else if crossedElite && snapshot.bondCharges > 0 {
            snapshot.bondCharges -= 1
            snapshot.pendingRewards += 1
            snapshot.petState = .bursting
        } else if snapshot.pendingRewards > 0 {
            snapshot.petState = .rewardReady
        } else if crossedElite {
            snapshot.petState = .eliteAlert
        } else if snapshot.workState == .awaitingApproval {
            snapshot.petState = .training
        } else if snapshot.bondCharges > 0 {
            snapshot.petState = .bondReady
        } else {
            snapshot.petState = .traveling
        }
    }

    private func success(id: Any?, result: Any) -> Data {
        response(id: id, ok: true, extra: ["result": result])
    }

    private func response(
        id: Any?,
        ok: Bool,
        error: String? = nil,
        message: String? = nil,
        extra: [String: Any] = [:]
    ) -> Data {
        var payload: [String: Any] = ["id": id ?? NSNull(), "ok": ok]
        if let error { payload["error"] = error }
        if let message { payload["message"] = message }
        extra.forEach { payload[$0] = $1 }
        return (try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])) ?? Data("{\"ok\":false}".utf8)
    }
}

private enum ServiceError: Error, LocalizedError {
    case invalidParameter(String)
    case noBondCharge
    case noPendingReward
    case insufficientGold
    case insufficientMaterials
    case unknownAction(String)

    var errorDescription: String? {
        switch self {
        case .invalidParameter(let name): "Invalid parameter: \(name)."
        case .noBondCharge: "No Bond Burst charge is available."
        case .noPendingReward: "No reward is waiting to be claimed."
        case .insufficientGold: "Not enough Gold."
        case .insufficientMaterials: "Not enough Gear Materials."
        case .unknownAction(let type): "Unknown action: \(type)."
        }
    }
}
