export class RingPuzzle{
    constructor(scene, options = {}) {
        this.scene = scene;

        this.numPositions = options.numPositions ?? 8;
        this.targets = options.targets ?? [2, 5, 1]; // one target per ring
        this.rotateSpeed = options.rotateSpeed ?? 6; // radians/sec, for the tween

        this.coupling = options.coupling ?? 'none';

        this.solved = false;
        this.rings = [];      // [{ mesh, currentPosition, targetRotation, isCorrect, targetTick }]
        this.ringMeshes = []; // flat list, for raycasting

        this._sharedNeutralTickMaterial = new THREE.MeshStandardMaterial({
        color: 0x3a4250,
        metalness: 0.4,
        roughness: 0.7,
        });
        this._sharedRivetGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8);
        this._sharedRivetMaterial = new THREE.MeshStandardMaterial({
        color: 0x14171d,
        metalness: 0.6,
        roughness: 0.6,
        });
        this._sharedTickGeometry = new THREE.BoxGeometry(0.03, 0.1, 0.02);
        this._sharedPointerGeometry = new THREE.BoxGeometry(0.26, 0.05, 0.05);
        this._sharedPointerMaterial = new THREE.MeshStandardMaterial({
        color: 0xffcc33,
        emissive: 0x664400,
        emissiveIntensity: 0.6,
        metalness: 0.5,
        roughness: 0.3,
        });

            this.hub = new THREE.Group();
        this.hub.name = 'LightsPuzzleRoot';
        this.scene.add(this.hub);

        this._buildPanel();
        this._buildRings();
    }
    
}