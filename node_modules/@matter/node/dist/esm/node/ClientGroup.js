/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { ServerNodeStore } from "#storage/server/ServerNodeStore.js";
import { ClientNode } from "./ClientNode.js";
import { ClientGroupInteraction } from "./client/ClientGroupInteraction.js";
class ClientGroup extends ClientNode {
  #interaction;
  get isGroup() {
    return true;
  }
  get interaction() {
    if (this.#interaction === void 0) {
      this.#interaction = new ClientGroupInteraction(this);
    }
    return this.#interaction;
  }
  get store() {
    return this.env.get(ServerNodeStore).clientStores.storeForGroup(this);
  }
}
((ClientGroup2) => {
  function is(value) {
    return value instanceof ClientGroup2;
  }
  ClientGroup2.is = is;
})(ClientGroup || (ClientGroup = {}));
export {
  ClientGroup
};
//# sourceMappingURL=ClientGroup.js.map
