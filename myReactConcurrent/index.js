var __spreadArray = (this && this.__spreadArray) || function (to, from) {
    for (var i = 0, il = from.length, j = to.length; i < il; i++, j++)
        to[j] = from[i];
    return to;
};
var EffectTag;
(function (EffectTag) {
    EffectTag[EffectTag["INSERT"] = 1] = "INSERT";
    EffectTag[EffectTag["UPDATE"] = 2] = "UPDATE";
    EffectTag[EffectTag["DELETE"] = 4] = "DELETE";
    // 记录旧节点还在不在，用于删除
    EffectTag[EffectTag["VISITED"] = 8] = "VISITED";
})(EffectTag || (EffectTag = {}));
function hasEffectTagOrNot(fiber, effectTag) {
    return (fiber.effect & effectTag) !== 0;
}
var TEXT_ELEMENT = 'TEXT_ELEMENT';
var reconcilToDelete = [];
// commit 专用
var currentTopFiber = null;
// hooks 专用
var currentReconcilFiber = null;
function Fragment(props) {
    return props.children;
}
function refer(ref, dom) {
    if (ref) {
        if (typeof ref === 'function') {
            ref(dom);
        }
        else {
            ref.current = dom;
        }
    }
}
function createElement(type, attrs) {
    if (attrs === void 0) { attrs = {}; }
    var childrenElements = [];
    for (var _i = 2; _i < arguments.length; _i++) {
        childrenElements[_i - 2] = arguments[_i];
    }
    var props = attrs || {};
    var children = [];
    var key = props.key || null;
    var ref = props.ref || null;
    for (var i = 0; i < childrenElements.length; i++) {
        var child = childrenElements[i];
        if (child) {
            if (typeof child === 'string' || typeof child === 'number') {
                var element = createTextElement(child);
                children.push(element);
            }
            else if (Array.isArray(child)) {
                children = __spreadArray(__spreadArray([], children), child);
            }
            else {
                children.push(child);
            }
        }
    }
    props.children = children;
    return {
        type: type,
        props: props,
        key: key,
        ref: ref,
        effect: 0
    };
}
function createTextElement(text) {
    return {
        type: TEXT_ELEMENT,
        props: {
            nodeValue: text,
            children: []
        }
    };
}
function render(reactElement, dom) {
    var rootFiber = {
        dom: dom,
        props: {
            children: [reactElement]
        },
        time: 0,
        type: dom.tagName.toLowerCase()
    };
    dispatchUpdate(rootFiber);
}
function createDom(fiber) {
    if (typeof fiber.type !== 'string') {
        return null;
    }
    var dom;
    if (fiber.type === TEXT_ELEMENT) {
        dom = document.createTextNode('');
    }
    else {
        dom = document.createElement(fiber.type);
    }
    dom = updateDomProps(dom, {}, fiber.props);
    return dom;
}
function updateDomProps(dom, prevProps, nextProps) {
    if (prevProps === void 0) { prevProps = {}; }
    // 删掉新的有老的没有的 props
    for (var name_1 in prevProps) {
        if (name_1 === 'children') {
            continue;
        }
        var oldValue = prevProps[name_1];
        var newValue = nextProps[name_1];
        if (newValue == null) {
            if (name_1.slice(0, 2) == 'on') {
                var eventName = name_1.slice(2).toLowerCase();
                dom.removeEventListener(eventName, oldValue);
            }
            else if (name_1 in dom) {
                dom[name_1] = '';
            }
            else {
                dom.removeAttribute(name_1);
            }
        }
    }
    // 添加/修改 新的 props
    for (var name_2 in nextProps) {
        if (name_2 === 'children') {
            continue;
        }
        var oldValue = prevProps[name_2];
        var newValue = nextProps[name_2];
        if (name_2.slice(0, 2) === 'on') {
            var eventName = name_2.slice(2).toLowerCase();
            dom.removeEventListener(eventName, oldValue);
            dom.addEventListener(eventName, newValue);
        }
        else {
            if (newValue !== oldValue) {
                if (name_2 in dom) {
                    dom[name_2] = newValue;
                }
                else {
                    dom.setAttribute(name_2, newValue);
                }
            }
        }
    }
    return dom;
}
function dispatchUpdate(fiber) {
    currentTopFiber = fiber;
    // scheduleCallback(workLoop.bind(null, fiber))
    workLoop(fiber);
}
var shouldYield = false;
function scheduleCallback(func) {
    function callback(deadline) {
        shouldYield = deadline.timeRemaining() < 1;
        func();
        window.requestIdleCallback(callback);
    }
    window.requestIdleCallback(callback);
}
function isShouldYield() {
    return shouldYield;
}
function workLoop(fiber) {
    var nowFiber = fiber;
    while (nowFiber && !isShouldYield()) {
        nowFiber = reconcil(nowFiber);
    }
    if (nowFiber) {
        workLoop(nowFiber);
    }
    else {
        commitTop();
    }
    return null;
}
function reconcil(fiber) {
    var isFunctionComponent = typeof fiber.type === 'function';
    if (isFunctionComponent) {
        updateFunctionComponent(fiber);
    }
    else {
        updateElementComponent(fiber);
    }
    if (fiber.child) {
        return fiber.child;
    }
    while (fiber) {
        if (fiber.sibling) {
            return fiber.sibling;
        }
        fiber = fiber.parent;
    }
}
// diff elements 并把 elements 变成 fibers
function reconcilChildren(fiber, newChildren) {
    var _a;
    var oldFiber = (_a = fiber.alternate) === null || _a === void 0 ? void 0 : _a.child;
    var oldChildren = [];
    // TODO: 空间开销过大？
    var oldChildrenDict = {};
    var oldFiberNow = oldFiber;
    var index = 0;
    while (oldFiberNow) {
        var oldFiberKey = oldFiberNow.key || index;
        index += 1;
        var oldTypeStr = oldFiberNow.type.toString();
        oldChildrenDict[oldFiberKey + oldTypeStr] = oldFiberNow;
        oldChildren.push(oldFiberNow);
        oldFiberNow = oldFiberNow.sibling;
    }
    for (var i = 0; i < newChildren.length; i++) {
        var newFiber = newChildren[i];
        var newFiberKey = newFiber.key || i;
        var newTypeStr = newFiber.type.toString();
        var sameOldFiber = oldChildrenDict[newFiberKey + newTypeStr];
        if (sameOldFiber) {
            newFiber.effect = EffectTag.UPDATE;
            newFiber.alternate = sameOldFiber;
            newFiber.dom = sameOldFiber.dom;
            sameOldFiber.effect |= EffectTag.VISITED;
        }
        else {
            newFiber.alternate = newFiber;
            newFiber.effect = EffectTag.INSERT;
        }
        if (i === 0) {
            fiber.child = newFiber;
        }
        newFiber.parent = fiber;
        newFiber.sibling = newChildren[i + 1];
    }
    for (var key in oldChildrenDict) {
        var oldFiber_1 = oldChildrenDict[key];
        if (!hasEffectTagOrNot(oldFiber_1, EffectTag.VISITED)) {
            oldFiber_1.effect |= EffectTag.DELETE;
            reconcilToDelete.push(oldFiber_1);
        }
    }
}
function updateFunctionComponent(fiber) {
    currentReconcilFiber = fiber;
    var newChildren = [fiber.type(fiber.props)];
    resetHooksIndex();
    reconcilChildren(fiber, newChildren);
}
function updateElementComponent(fiber) {
    // 可以在 reconcil 阶段建 dom 吗？
    if (!fiber.dom) {
        fiber.dom = createDom(fiber);
    }
    var newChildren = fiber.props.children;
    reconcilChildren(fiber, newChildren);
}
function commitTop() {
    if (currentTopFiber) {
        // rootFiber 的情况
        currentTopFiber.parent ? commit(currentTopFiber) : commit(currentTopFiber.child);
        reconcilToDelete.forEach(commit);
        currentTopFiber = null;
    }
}
function commit(fiber) {
    var _a;
    if (!fiber) {
        return;
    }
    var hasDomFiber = fiber.parent;
    while (!hasDomFiber.dom) {
        hasDomFiber = hasDomFiber.parent;
    }
    var parentDom = hasDomFiber.dom;
    if (fiber.dom && hasEffectTagOrNot(fiber, EffectTag.DELETE)) {
        parentDom.removeChild(fiber.dom);
        refer(fiber.ref, null);
        fiber.effect = 0;
        return;
    }
    if (fiber.dom && hasEffectTagOrNot(fiber, EffectTag.INSERT)) {
        var siblingDom = null;
        var siblingFiber = fiber.sibling;
        while (siblingFiber) {
            if (!hasEffectTagOrNot(fiber.sibling, EffectTag.INSERT) && siblingFiber.dom) {
                siblingDom = siblingFiber.dom;
                break;
            }
            siblingFiber = siblingFiber.sibling;
        }
        parentDom.insertBefore(fiber.dom, siblingDom);
    }
    if (fiber.dom && hasEffectTagOrNot(fiber, EffectTag.UPDATE)) {
        updateDomProps(fiber.dom, (_a = fiber.alternate) === null || _a === void 0 ? void 0 : _a.props, fiber.props);
    }
    refer(fiber.ref, fiber.dom);
    fiber.effect = 0;
    commit(fiber.child);
    commit(fiber.sibling);
}
// 一个 func 可能调了多次 useState
var hooksIndex = 0;
function resetHooksIndex() {
    hooksIndex = 0;
}
function useState(value) {
    if (currentReconcilFiber) {
        // const hooks = (currentReconcilFiber.hooks || []) as T[]
        var hooks = currentReconcilFiber.hooks;
        if (!hooks) {
            currentReconcilFiber.hooks = [];
        }
        if (hooksIndex <= currentReconcilFiber.hooks.length) {
            currentReconcilFiber.hooks.push({ state: value, fiber: currentReconcilFiber });
        }
        var hook_1 = currentReconcilFiber.hooks[hooksIndex++];
        hook_1.fiber = currentReconcilFiber;
        return [
            hook_1.state,
            function (func) {
                var state = func(hook_1.state);
                hook_1.state = state;
                dispatchUpdate(hook_1.fiber);
            }
        ];
    }
}
var Didact = {
    createElement: createElement,
    render: render,
    useState: useState
};
