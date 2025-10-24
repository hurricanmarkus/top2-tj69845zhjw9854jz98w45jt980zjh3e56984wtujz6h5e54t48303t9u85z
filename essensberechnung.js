import { USERS, currentMeal } from './haupteingang.js';
import { populatePersonDropdown } from './checklist.js';

function setDefaultPortionName() {
    const personId = document.getElementById('person-select').value;
    const nameInput = document.getElementById('portion-name');
    if (!nameInput || !personId) {
        nameInput.value = ''; // Leeren, wenn keine Person gewählt ist
        return;
    };

    const weekdays = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
    const today = new Date();

    // Beginne mit dem heutigen Tag
    let nextDayIndex = today.getDay();

    let suggestedName = '';
    // Loop durch maximal 7 Tage, um einen freien Tag zu finden
    for (let i = 0; i < 7; i++) {
        const potentialName = weekdays[nextDayIndex];
        // Prüfen, ob dieser Name für den gewählten User schon existiert
        const nameExists = currentMeal.userInputDistribution.some(
            p => p.personId === personId && p.portionName.toLowerCase() === potentialName.toLowerCase()
        );

        if (!nameExists) {
            suggestedName = potentialName;
            break; // Freien Tag gefunden, Schleife beenden
        }
        // Zum nächsten Tag weitergehen
        nextDayIndex = (nextDayIndex + 1) % 7;
    }

    // Setze den gefundenen Namen oder einen Fallback, falls alle Tage belegt sind
    nameInput.value = suggestedName || weekdays[nextDayIndex];
}

function setupEssensberechnungListeners() {
    const view = document.getElementById('essensberechnungView');
    if (view.dataset.listenerAttached === 'true') return;

    // ----- Helper-Funktion zum Zurücksetzen des Formulars -----
    const resetPortionForm = () => {
        editingPortionId = null;
        const restBtn = document.getElementById('rest-mode-btn');
        if (restBtn.classList.contains('bg-indigo-500')) {
            restBtn.classList.remove('bg-indigo-500', 'text-white');
            restBtn.classList.add('bg-gray-200', 'text-gray-800');
            document.getElementById('person-select').disabled = false;
            document.getElementById('portion-name').disabled = false;
        }
        const personSelect = document.getElementById('person-select');
        personSelect.value = '';
        const placeholderOption = personSelect.querySelector('option[value=""]');
        if (placeholderOption) placeholderOption.disabled = false;

        document.getElementById('portion-name').value = '';
        document.getElementById('portion-anzahl').value = 1;
        document.querySelectorAll('.recipe-portion-weight-input, .product-value-input').forEach(input => {
            input.value = '';
            input.disabled = false;
        });
        document.querySelectorAll('.product-mode-radio[value="gramm"]').forEach(radio => radio.checked = true);
        document.getElementById('add-portion-definition-btn').classList.remove('hidden');
        document.getElementById('update-portion-definition-btn').classList.add('hidden');
        document.getElementById('delete-portion-definition-btn').classList.add('hidden');
        document.getElementById('portion-definition-form').classList.remove('bg-yellow-50');
        setDefaultPortionName();
        renderDistributionList();
    };

    view.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;

        if (e.target.id === 'single-product-weight') {
            e.preventDefault();
            document.getElementById('add-single-product-btn').click();
        }
        if (e.target.classList.contains('ingredient-weight')) {
            e.preventDefault();
            const recipeCard = e.target.closest('.recipe-card');
            if (recipeCard) {
                recipeCard.querySelector('.add-ingredient-btn').click();
            }
        }
    });

    const personSelectForEvent = document.getElementById('person-select');
    if (personSelectForEvent) {
        personSelectForEvent.addEventListener('change', setDefaultPortionName);
    }

    // ----- Haupt-Click-Listener -----
    view.addEventListener('click', (e) => {
        // --- Interaktionen im oberen Bereich (Produkte, Rezepte) ---
        if (e.target.closest('#add-single-product-btn')) {
            const nameInput = view.querySelector('#single-product-name');
            const weightInput = view.querySelector('#single-product-weight');
            const name = nameInput.value.trim();
            const weight = parseFloat(weightInput.value);
            if (name && weight > 0) {
                currentMeal.singleProducts.push({ id: Date.now(), name, weight });
                nameInput.value = '';
                weightInput.value = '';
                renderMealComposition();
                renderDistributionInputs();
                nameInput.focus();
            }
        }
        if (e.target.closest('.delete-recipe-btn')) {
            const recipeId = parseInt(e.target.closest('.delete-recipe-btn').dataset.recipeId);
            if (confirm("Möchten Sie dieses Rezept wirklich löschen?")) {
                currentMeal.recipes = currentMeal.recipes.filter(r => r.id !== recipeId);
                renderMealComposition();
                renderDistributionInputs();
            }
        }
        if (e.target.closest('.delete-single-product-btn')) {
            const productId = parseInt(e.target.closest('.delete-single-product-btn').dataset.id);
            currentMeal.singleProducts = currentMeal.singleProducts.filter(p => p.id !== productId);
            renderMealComposition();
            renderDistributionInputs();
        }
        if (e.target.closest('#add-recipe-btn')) {
            const recipeName = prompt("Wie soll das neue Rezept heißen?");
            if (recipeName && recipeName.trim()) {
                currentMeal.recipes.push({ id: Date.now(), name: recipeName.trim(), ingredients: [], calculatedFinalWeight: 0 });
                renderMealComposition();
                renderDistributionInputs();
            }
        }
        // ERSETZE DEN KOMPLETTEN if-BLOCK FÜR ".add-ingredient-btn"

        if (e.target.closest('.add-ingredient-btn')) {
            const recipeId = parseInt(e.target.closest('.add-ingredient-btn').dataset.recipeId);
            const recipeCard = view.querySelector(`.recipe-card[data-recipe-id="${recipeId}"]`);
            const nameInput = recipeCard.querySelector('.ingredient-name');
            const weightInput = recipeCard.querySelector('.ingredient-weight');
            const name = nameInput.value.trim();
            const weight = parseFloat(weightInput.value);

            if (name && weight > 0) {
                const recipe = currentMeal.recipes.find(r => r.id === recipeId);
                if (recipe) {
                    // 1. Daten aktualisieren
                    recipe.ingredients.push({ id: Date.now(), name, weight });

                    // 2. Den Bereich komplett neu zeichnen
                    renderMealComposition();

                    // 3. JETZT ERST das neue Eingabefeld im neu gezeichneten
                    //    Bereich suchen und den Fokus darauf setzen.
                    const newRecipeCard = view.querySelector(`.recipe-card[data-recipe-id="${recipeId}"]`);
                    if (newRecipeCard) {
                        const newNameInput = newRecipeCard.querySelector('.ingredient-name');
                        if (newNameInput) {
                            newNameInput.focus();
                        }
                    }
                }
            }
        } if (e.target.closest('.delete-ingredient-btn')) {
            const btn = e.target.closest('.delete-ingredient-btn');
            const recipeId = parseInt(btn.dataset.recipeId);
            const ingredientId = parseInt(btn.dataset.ingredientId);
            const recipe = currentMeal.recipes.find(r => r.id === recipeId);
            if (recipe) {
                recipe.ingredients = recipe.ingredients.filter(i => i.id !== ingredientId);
                renderMealComposition();
            }
        }

        // --- Logik für den "Rest"-Button ---
        if (e.target.closest('#rest-mode-btn')) {
            const btn = e.target.closest('#rest-mode-btn');
            const personSelect = document.getElementById('person-select');
            const portionNameInput = document.getElementById('portion-name');
            const isActivating = !btn.classList.contains('bg-indigo-500');

            if (isActivating) {
                btn.classList.add('bg-indigo-500', 'text-white');
                btn.classList.remove('bg-gray-200', 'text-gray-800');
                personSelect.disabled = true;
                portionNameInput.disabled = true;
                portionNameInput.value = 'Rest';
                personSelect.value = '';
            } else {
                btn.classList.remove('bg-indigo-500', 'text-white');
                btn.classList.add('bg-gray-200', 'text-gray-800');
                personSelect.disabled = false;
                portionNameInput.disabled = false;
                portionNameInput.value = '';
                setDefaultPortionName();
            }
        }

        // --- Modus-Umschalter für Produkte ---
        const modeRadio = e.target.closest('.product-mode-radio');
        if (modeRadio) {
            const group = modeRadio.closest('.product-input-group');
            const valueInput = group.querySelector('.product-value-input');
            valueInput.disabled = (modeRadio.value !== 'gramm');
            if (valueInput.disabled) valueInput.value = '';
        }

        // --- Klick auf eine definierte Portion zum Bearbeiten ODER ABWÄHLEN ---
        const portionItem = e.target.closest('.portion-definition-item');
        if (portionItem && !e.target.closest('.delete-portion-definition-btn')) {
            const portionId = parseInt(portionItem.dataset.id);

            if (editingPortionId === portionId) {
                resetPortionForm();
                return;
            }

            const portionData = currentMeal.userInputDistribution.find(p => p.id === portionId);
            if (!portionData) return;

            editingPortionId = portionId;
            document.getElementById('portion-definition-form').classList.add('bg-yellow-50');
            document.getElementById('add-portion-definition-btn').classList.add('hidden');
            document.getElementById('update-portion-definition-btn').classList.remove('hidden');
            document.getElementById('delete-portion-definition-btn').classList.remove('hidden');

            const personSelect = document.getElementById('person-select');
            const placeholderOption = personSelect.querySelector('option[value=""]');
            const restBtn = document.getElementById('rest-mode-btn');

            if (portionData.personId === 'rest_user') {
                if (!restBtn.classList.contains('bg-indigo-500')) {
                    restBtn.click();
                }
            } else {
                if (restBtn.classList.contains('bg-indigo-500')) {
                    restBtn.click();
                }
                personSelect.value = portionData.personId;
                if (placeholderOption) placeholderOption.disabled = true;
            }

            document.getElementById('portion-name').value = portionData.portionName;
            document.getElementById('portion-anzahl').value = portionData.anzahl;

            portionData.recipeInputs.forEach(ri => {
                const input = view.querySelector(`.recipe-portion-weight-input[data-recipe-id="${ri.recipeId}"]`);
                if (input) input.value = ri.weight > 0 ? ri.weight : '';
            });
            portionData.productInputs.forEach(pi => {
                const group = view.querySelector(`.product-input-group[data-product-id="${pi.productId}"]`);
                if (group) {
                    group.querySelector(`input[name="mode-${pi.productId}"][value="${pi.mode}"]`).checked = true;
                    const valueInput = group.querySelector('.product-value-input');
                    valueInput.value = pi.value > 0 ? pi.value : '';
                    valueInput.disabled = (pi.mode !== 'gramm');
                }
            });

            renderDistributionList();
        }

        // --- Klick auf "Änderung übernehmen" ---
        if (e.target.closest('#update-portion-definition-btn')) {
            if (!editingPortionId) return;
            const portionToUpdate = currentMeal.userInputDistribution.find(p => p.id === editingPortionId);
            if (!portionToUpdate) return;

            const isRestPortion = document.getElementById('rest-mode-btn').classList.contains('bg-indigo-500');
            const personSelect = document.getElementById('person-select');

            portionToUpdate.personId = isRestPortion ? 'rest_user' : personSelect.value;
            portionToUpdate.personName = isRestPortion ? 'Rest' : personSelect.options[personSelect.selectedIndex].text;
            portionToUpdate.portionName = document.getElementById('portion-name').value.trim();
            portionToUpdate.anzahl = parseInt(document.getElementById('portion-anzahl').value) || 1;

            portionToUpdate.recipeInputs = [];
            document.querySelectorAll('.recipe-portion-weight-input').forEach(input => {
                portionToUpdate.recipeInputs.push({ recipeId: parseInt(input.dataset.recipeId), weight: parseFloat(input.value) || 0 });
            });
            portionToUpdate.productInputs = [];
            document.querySelectorAll('.product-input-group').forEach(group => {
                portionToUpdate.productInputs.push({
                    productId: parseInt(group.dataset.productId),
                    mode: group.querySelector('.product-mode-radio:checked').value,
                    value: parseFloat(group.querySelector('.product-value-input').value) || 0
                });
            });

            resetPortionForm();
        }

        // --- Portion zur Definitions-Liste hinzufügen ---
        if (e.target.closest('#add-portion-definition-btn')) {
            const isRestPortion = document.getElementById('rest-mode-btn').classList.contains('bg-indigo-500');
            const personSelect = document.getElementById('person-select');
            const personId = isRestPortion ? 'rest_user' : personSelect.value;
            const personName = isRestPortion ? 'Rest' : personSelect.options[personSelect.selectedIndex].text;
            const portionName = document.getElementById('portion-name').value.trim();
            const anzahl = parseInt(document.getElementById('portion-anzahl').value) || 1;

            if ((isRestPortion && currentMeal.userInputDistribution.some(p => p.personId === 'rest_user')) || (!isRestPortion && !personId) || !portionName) {
                if (isRestPortion) alertUser("Es kann nur eine 'Rest'-Portion definiert werden.", "error");
                else alertUser("Bitte Person und Portionsnamen angeben.", "error");
                return;
            }

            const recipeInputs = [];
            document.querySelectorAll('.recipe-portion-weight-input').forEach(input => {
                recipeInputs.push({ recipeId: parseInt(input.dataset.recipeId), weight: parseFloat(input.value) || 0 });
            });
            const productInputs = [];
            document.querySelectorAll('.product-input-group').forEach(group => {
                productInputs.push({
                    productId: parseInt(group.dataset.productId),
                    mode: group.querySelector('.product-mode-radio:checked').value,
                    value: parseFloat(group.querySelector('.product-value-input').value) || 0
                });
            });

            currentMeal.userInputDistribution.push({
                id: Date.now(), portionName, personId, personName, anzahl,
                recipeInputs, productInputs
            });

            resetPortionForm();
        }

        // --- Eine Portions-Definition wieder aus der Liste löschen ---
        const deleteDefBtn = e.target.closest('#delete-portion-definition-btn');
        if (deleteDefBtn) {
            if (editingPortionId && confirm("Möchten Sie die ausgewählte Portion wirklich löschen?")) {
                // Filtere die gelöschte Portion aus der Liste
                currentMeal.userInputDistribution = currentMeal.userInputDistribution.filter(p => p.id !== editingPortionId);
                // Setze das Formular zurück
                resetPortionForm();
            }
        }
        // --- Finale Berechnung für alles in der Liste starten ---
        if (e.target.closest('#run-calculation-btn')) {
            calculateAndRenderDistribution();
        }

        // --- Interaktive Buttons im Ergebnisbereich ---
        const viewBtn = e.target.closest('.view-btn');
        if (viewBtn) {
            const mode = viewBtn.dataset.viewMode;
            displayCalculationResult(mode);

            document.querySelectorAll('#calculation-view-switcher .view-btn').forEach(btn => {
                btn.classList.remove('bg-indigo-500', 'text-white');
                btn.classList.add('bg-gray-300', 'hover:bg-gray-400');
            });
            viewBtn.classList.add('bg-indigo-500', 'text-white');
            viewBtn.classList.remove('bg-gray-300', 'hover:bg-gray-400');
        }
    });

    view.dataset.listenerAttached = 'true';
}

function renderMealComposition() {
    const singleProductsList = document.getElementById('single-products-list');
    const recipesArea = document.getElementById('recipes-area');

    singleProductsList.innerHTML = currentMeal.singleProducts.map(p => `
        <div class="flex justify-between items-center bg-gray-50 p-2 rounded-lg">
            <span>${p.name} - <strong>${p.weight}g</strong></span>
            <button data-id="${p.id}" class="delete-single-product-btn p-1 text-red-400 hover:text-red-600">&times;</button>
        </div>
    `).join('');

    recipesArea.innerHTML = currentMeal.recipes.map(r => {
        const totalRawWeight = r.ingredients.reduce((sum, i) => sum + i.weight, 0);
        return `
        <div class="recipe-card p-3 border rounded-lg bg-blue-50" data-recipe-id="${r.id}">
            <div class="flex justify-between items-center">
                <h4 class="font-semibold text-blue-800">${r.name}</h4>
                <button data-recipe-id="${r.id}" class="delete-recipe-btn p-1 text-red-500 hover:bg-red-100 rounded-full">&times;</button>
            </div>

            <div class="mt-3 p-2 bg-blue-100 rounded-md">
                <span class="text-sm font-semibold text-blue-900">Berechnetes Endgewicht (gekocht):</span>
                <div id="recipe-calculated-weight-${r.id}" class="text-lg font-bold text-blue-900">${r.calculatedFinalWeight ? r.calculatedFinalWeight.toFixed(1) + 'g' : '...'}</div>
                <div class="text-xs text-blue-700">Rohgewicht der Zutaten: ${totalRawWeight}g</div>
            </div>
            <div class="mt-2 space-y-1 pl-4">
                ${r.ingredients.map(i => `
                    <div class="flex justify-between items-center text-sm">
                        <span>- ${i.name} (${i.weight}g)</span>
                        <button data-recipe-id="${r.id}" data-ingredient-id="${i.id}" class="delete-ingredient-btn p-1 text-red-400 hover:text-red-600">&times;</button>
                    </div>
                `).join('')}
            </div>
            <div class="flex gap-2 mt-3 pt-3 border-t">
                <input type="text" class="ingredient-name flex-grow p-1 border rounded-md text-sm" placeholder="Zutat">
                <input type="number" class="ingredient-weight w-20 p-1 border rounded-md text-sm" placeholder="g">
                <button data-recipe-id="${r.id}" class="add-ingredient-btn py-1 px-2 bg-blue-500 text-white text-xs font-bold rounded-md hover:bg-blue-600">+</button>
            </div>
        </div>
    `}).join('');
}

function renderDistributionList() {
    const distributionList = document.getElementById('distribution-list');
    if (!distributionList) return; // Sicherstellen, dass das Element existiert

    if (!currentMeal.userInputDistribution || currentMeal.userInputDistribution.length === 0) {
        distributionList.innerHTML = '<p class="text-sm text-center text-gray-400">Noch keine Portionen definiert.</p>';
    } else {
        distributionList.innerHTML = currentMeal.userInputDistribution.map(p => {
            const isEditing = p.id === editingPortionId;
            const itemClasses = isEditing
                ? 'bg-yellow-100 border-yellow-400' // Klasse für den Bearbeitungsmodus
                : 'bg-gray-50 hover:bg-yellow-50'; // Standardklassen mit Hover-Effekt

            // Korrekte Anzeige für "Rest" oder "Portionsname (Personenname)"
            const displayName = p.personId === 'rest_user'
                ? 'Rest'
                : `${p.portionName} (${p.personName})`;

            return `
                <div data-id="${p.id}" class="portion-definition-item flex justify-between items-center p-2 rounded-lg text-sm border cursor-pointer transition-colors ${itemClasses}">
                    <div>
                        <p class="font-bold">${displayName}</p>
                        <p class="text-xs text-gray-600">Anzahl: ${p.anzahl}</p>
                    </div>
                     {/* Hier könnte optional ein kleiner Bearbeiten/Löschen Knopf hin,
                         aber die Hauptlogik ist, auf das Item selbst zu klicken */}
                </div>
            `;
        }).join('');
    }
}

function renderDistributionInputs() {
    const recipeContainer = document.getElementById('recipe-weights-for-person');
    const productContainer = document.getElementById('product-weights-for-person');
    if (!recipeContainer || !productContainer) return;

    // KORREKTUR: Dieser Block erstellt die fehlenden Eingabefelder für Rezepte
    if (currentMeal.recipes.length > 0) {
        recipeContainer.innerHTML = `<h4 class="text-sm font-semibold text-gray-600 mb-2">Rezept-Gewicht pro Portion (gekocht):</h4>` +
            currentMeal.recipes.map(recipe => `
            <div class="flex items-center gap-2 mb-2">
                <label class="flex-grow text-sm font-medium">${recipe.name}:</label>
                <input type="number" class="recipe-portion-weight-input w-24 p-1 border rounded-md" placeholder="g" data-recipe-id="${recipe.id}">
            </div>
        `).join('');
    } else {
        recipeContainer.innerHTML = '';
    }

    // Dieser Teil für die Einzelprodukte war bereits korrekt
    if (currentMeal.singleProducts.length > 0) {
        productContainer.innerHTML = `<h4 class="text-sm font-semibold text-gray-600 mb-2">Gewicht der Einzelprodukte:</h4>` +
            currentMeal.singleProducts.map(product => `
            <div class="p-2 border rounded-md bg-gray-50 product-input-group" data-product-id="${product.id}">
                <label class="font-semibold text-sm text-gray-800">${product.name}:</label>
                <div class="flex items-center gap-2 mt-1">
                    <input type="number" class="product-value-input flex-grow p-1 border rounded-md" placeholder="g">
                    <div class="flex items-center gap-3 text-xs font-medium">
                        <label><input type="radio" name="mode-${product.id}" value="gramm" class="product-mode-radio" checked> g</label>
                        <label><input type="radio" name="mode-${product.id}" value="auto %" class="product-mode-radio"> auto %</label>
                        <label><input type="radio" name="mode-${product.id}" value="auto Port." class="product-mode-radio"> auto Port.</label>
                    </div>
                </div>
            </div>
        `).join('');
    } else {
        productContainer.innerHTML = '';
    }
}

function calculateAndRenderDistribution() {
    currentMeal.finalDistribution = [];
    const resultsTable = document.getElementById('results-table');
    resultsTable.innerHTML = `<p class="text-sm text-gray-500 text-center">Bitte eine Ansicht (Gesamt, Rest oder eine Portion) auswählen, um das Ergebnis anzuzeigen.</p>`;

    if (currentMeal.userInputDistribution.length === 0) {
        renderCalculationViewSwitcher();
        return;
    }

    currentMeal.recipes.forEach(recipe => {
        const totalCookedWeight = currentMeal.userInputDistribution.reduce((sum, p) => {
            const recipeInput = p.recipeInputs.find(ri => ri.recipeId === recipe.id);
            return sum + ((recipeInput ? recipeInput.weight : 0) * p.anzahl);
        }, 0);
        recipe.calculatedFinalWeight = totalCookedWeight;
    });

    let totalGrammValueForRatio = currentMeal.userInputDistribution.reduce((sum, p) => {
        const grammSum = p.productInputs.reduce((s, pi) => s + (pi.mode === 'gramm' ? pi.value : 0), 0);
        return sum + (grammSum * p.anzahl);
    }, 0);
    const totalPortionCount = currentMeal.userInputDistribution.reduce((sum, p) => sum + p.anzahl, 0);

    currentMeal.userInputDistribution.forEach(portionInput => {
        for (let i = 0; i < portionInput.anzahl; i++) {
            const finalPortionData = new Map();

            portionInput.recipeInputs.forEach(ri => {
                const recipe = currentMeal.recipes.find(r => r.id === ri.recipeId);
                if (!recipe || ri.weight === 0) return;
                finalPortionData.set(`Rezept: ${recipe.name}`, ri.weight);
            });

            const portionGrammValue = portionInput.productInputs.reduce((s, pi) => s + (pi.mode === 'gramm' ? pi.value : 0), 0);
            const portionProductRatio = (totalGrammValueForRatio > 0) ? (portionGrammValue / totalGrammValueForRatio) : (1 / totalPortionCount);
            portionInput.productInputs.forEach(pi => {
                const product = currentMeal.singleProducts.find(p => p.id === pi.productId);
                if (!product) return;
                let amount = 0;
                if (pi.mode === 'gramm') amount = pi.value;
                else if (pi.mode === 'auto %') amount = product.weight * portionProductRatio;
                else if (pi.mode === 'auto Port.') amount = (totalPortionCount > 0) ? product.weight / totalPortionCount : 0;

                if (amount > 0) {
                    finalPortionData.set(product.name, (finalPortionData.get(product.name) || 0) + amount);
                }
            });

            const portionId = portionInput.id + i;
            const portionName = (portionInput.anzahl > 1) ? `${portionInput.portionName} ${i + 1}/${portionInput.anzahl}` : portionInput.portionName;
            const displayName = portionInput.personName === 'Rest' ? 'Rest' : `${portionName} (${portionInput.personName})`;

            currentMeal.finalDistribution.push({ id: portionId, name: displayName, data: finalPortionData });
        }
    });

    currentMeal.finalDistribution = currentMeal.finalDistribution.filter(p => p.name !== 'Rest');

    const hasRestDefinition = currentMeal.userInputDistribution.some(p => p.personId === 'rest_user');
    if (hasRestDefinition) {
        const restData = new Map();

        // ★★★ START DER KORREKTUR ★★★
        // Zuerst den Rest der gekochten Rezepte berechnen und zu den Rest-Daten hinzufügen.
        currentMeal.recipes.forEach(recipe => {
            const totalRequiredCooked = currentMeal.userInputDistribution
                .filter(p => p.personId !== 'rest_user') // "Rest"-Eingabe ignorieren
                .reduce((sum, p) => {
                    const recipeInput = p.recipeInputs.find(ri => ri.recipeId === recipe.id);
                    return sum + ((recipeInput ? recipeInput.weight : 0) * p.anzahl);
                }, 0);

            const leftoverCooked = recipe.calculatedFinalWeight - totalRequiredCooked;
            if (leftoverCooked > 0.1) {
                restData.set(`Rezept: ${recipe.name}`, leftoverCooked);
            }
        });

        // Danach wie bisher die Reste der rohen Zutaten berechnen.
        const totalRequiredRaw = new Map();
        currentMeal.finalDistribution.forEach(portion => {
            portion.data.forEach((value, key) => {
                if (key.startsWith('Rezept: ')) {
                    const recipeName = key.replace('Rezept: ', '');
                    const recipe = currentMeal.recipes.find(r => r.name === recipeName);
                    if (recipe && recipe.calculatedFinalWeight > 0) {
                        const ratio = value / recipe.calculatedFinalWeight;
                        recipe.ingredients.forEach(ing => {
                            totalRequiredRaw.set(ing.name, (totalRequiredRaw.get(ing.name) || 0) + (ing.weight * ratio));
                        });
                    }
                } else {
                    totalRequiredRaw.set(key, (totalRequiredRaw.get(key) || 0) + value);
                }
            });
        });

        const totalAvailableRaw = new Map();
        currentMeal.singleProducts.forEach(p => {
            totalAvailableRaw.set(p.name, (totalAvailableRaw.get(p.name) || 0) + p.weight);
        });
        currentMeal.recipes.forEach(r => {
            r.ingredients.forEach(ing => {
                totalAvailableRaw.set(ing.name, (totalAvailableRaw.get(ing.name) || 0) + ing.weight);
            });
        });

        totalAvailableRaw.forEach((availableAmount, ingredientName) => {
            const requiredAmount = totalRequiredRaw.get(ingredientName) || 0;
            const leftover = availableAmount - requiredAmount;
            if (leftover > 0.1) {
                restData.set(ingredientName, leftover);
            }
        });

        currentMeal.finalDistribution.push({ id: 'rest', name: "Rest", data: restData });
        // ★★★ ENDE DER KORREKTUR ★★★
    }

    renderMealComposition();
    renderCalculationViewSwitcher();
    displayCalculationResult('gesamt');
    const gesamtBtn = document.querySelector('.view-btn[data-view-mode="gesamt"]');
    if (gesamtBtn) {
        document.querySelectorAll('#calculation-view-switcher .view-btn').forEach(btn => {
            btn.classList.remove('bg-indigo-500', 'text-white');
            btn.classList.add('bg-gray-300', 'hover:bg-gray-400');
        });
        gesamtBtn.classList.add('bg-indigo-500', 'text-white');
    }
}

function renderCalculationViewSwitcher() {

    const switcher = document.getElementById('calculation-view-switcher');
    if (!switcher) return;

    // Prüfen, ob eine "Rest"-Portion im finalen Ergebnis existiert
    const hasRestPortion = currentMeal.finalDistribution.some(p => p.id === 'rest');

    let switcherHTML = `
        <button class="view-btn p-2 text-sm font-semibold rounded-md bg-gray-300 hover:bg-gray-400" data-view-mode="gesamt">Gesamt</button>
    `;

    // Nur wenn eine Rest-Portion da ist, den Button hinzufügen
    if (hasRestPortion) {
        switcherHTML += `<button class="view-btn p-2 text-sm font-semibold rounded-md bg-gray-300 hover:bg-gray-400" data-view-mode="rest">Rest</button>`;
    }

    currentMeal.finalDistribution.forEach(portion => {
        // Nur echte Portionen als Button anzeigen, nicht den Rest
        if (portion.id !== 'rest') {
            switcherHTML += `<button class="view-btn p-2 text-sm font-semibold rounded-md bg-gray-300 hover:bg-gray-400" data-view-mode="${portion.id}">${portion.name}</button>`;
        }
    });

    switcher.innerHTML = switcherHTML;
}

function displayCalculationResult(mode) {
    const resultsTable = document.getElementById('results-table');
    let dataToShow = new Map();
    let header = '';

    if (mode === 'gesamt') {
        header = 'Gesamt';
        currentMeal.singleProducts.forEach(p => {
            dataToShow.set(p.name, (dataToShow.get(p.name) || 0) + p.weight);
        });
        currentMeal.recipes.forEach(r => {
            if (r.calculatedFinalWeight > 0) {
                dataToShow.set(`Rezept: ${r.name}`, r.calculatedFinalWeight);
            }
            r.ingredients.forEach(ing => {
                dataToShow.set(ing.name, (dataToShow.get(ing.name) || 0) + ing.weight);
            });
        });

    } else {
        const portionId = (mode === 'rest') ? 'rest' : parseInt(mode);
        const targetPortion = currentMeal.finalDistribution.find(p => p.id === portionId);
        if (targetPortion) {
            header = targetPortion.name;
            dataToShow = new Map(targetPortion.data);

            if (mode !== 'rest') {
                currentMeal.recipes.forEach(recipe => {
                    if (dataToShow.has(`Rezept: ${recipe.name}`)) {
                        const portionCookedWeight = dataToShow.get(`Rezept: ${recipe.name}`);
                        if (recipe.calculatedFinalWeight > 0) {
                            const ratio = portionCookedWeight / recipe.calculatedFinalWeight;
                            recipe.ingredients.forEach(ing => {
                                dataToShow.set(ing.name, (dataToShow.get(ing.name) || 0) + (ing.weight * ratio));
                            });
                        }
                    }
                });
            }
        }
    }

    let tableHTML = `<div class="overflow-x-auto"><table class="min-w-full bg-white border rounded-lg text-sm">
        <thead class="bg-gray-100"><tr>
            <th class="p-2 border-b text-left">Zutat / Rezept</th>
            <th class="p-2 border-b text-right">${header}</th>
        </tr></thead><tbody>`;

    const renderedKeys = new Set();

    // ★★★ START DER KORRIGIERTEN ANZEIGELOGIK ★★★

    // 1. Rezepte und deren Zutaten rendern
    currentMeal.recipes.forEach(recipe => {
        const recipeKey = `Rezept: ${recipe.name}`;
        const recipeCookedWeight = dataToShow.get(recipeKey) || 0;

        // Finde die Zutaten dieses Rezepts, die im Rest vorhanden sind
        const leftoverIngredientsForRecipe = recipe.ingredients.filter(ing => dataToShow.has(ing.name) && dataToShow.get(ing.name) > 0.1);

        // Zeige die blaue Kopfzeile an, wenn entweder das gekochte Rezept ODER Restzutaten davon existieren
        if (recipeCookedWeight > 0 || (mode === 'rest' && leftoverIngredientsForRecipe.length > 0)) {
            tableHTML += `<tr class="bg-blue-50 font-semibold hover:bg-blue-100">
                <td class="p-2 border-b">${recipe.name}</td>
                <td class="p-2 border-b text-right">${recipeCookedWeight > 0 ? recipeCookedWeight.toFixed(1) + 'g' : '<span class="text-gray-400 italic">Restzutaten</span>'}</td>
            </tr>`;
            renderedKeys.add(recipeKey);

            // Zeige die dazugehörigen Zutaten an
            const ingredientsToShow = (mode === 'rest') ? leftoverIngredientsForRecipe : recipe.ingredients;
            ingredientsToShow.forEach(ingredient => {
                const ingredientWeight = dataToShow.get(ingredient.name) || 0;
                if (ingredientWeight > 0.1 && !renderedKeys.has(ingredient.name)) {
                    tableHTML += `<tr class="hover:bg-gray-50">
                        <td class="p-2 border-b pl-6 text-gray-600">${ingredient.name}</td>
                        <td class="p-2 border-b text-right text-gray-600">${ingredientWeight.toFixed(1)}g</td>
                    </tr>`;
                    renderedKeys.add(ingredient.name);
                }
            });
        }
    });

    // 2. Alle restlichen Einträge rendern (Einzelprodukte oder Zutaten, die keinem Rezept zugeordnet sind)
    for (const [key, value] of dataToShow.entries()) {
        if (!renderedKeys.has(key) && value > 0.1) {
            tableHTML += `<tr class="hover:bg-gray-50">
                <td class="p-2 border-b font-semibold">${key}</td>
                <td class="p-2 border-b text-right">${value.toFixed(1)}g</td>
            </tr>`;
        }
    }
    // ★★★ ENDE DER KORRIGIERTEN ANZEIGELOGIK ★★★

    tableHTML += `</tbody></table></div>`;
    resultsTable.innerHTML = tableHTML;
}

export function initializeEssensberechnungView() {
    setupEssensberechnungListeners(); // Stellt sicher, dass die Listener nur einmal gesetzt werden
    populatePersonDropdown();         // Füllt das Dropdown-Menü EINMALIG

    // Beim ersten Öffnen die UI korrekt aufbauen
    renderMealComposition();
    renderDistributionInputs();
    renderDistributionList(); // Zeigt die Liste der bereits definierten Portionen an

    // Setzt den Standard-Portionsnamen (z.B. "Mittwoch")
    setDefaultPortionName();
}